import argparse
import os
import random
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
import numpy as np
from pathlib import Path

try:
    from tqdm import tqdm
except ImportError as e:
    raise SystemExit(
        "Install tqdm for progress bars: pip install tqdm"
    ) from e

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_WLASL_ROOT = SCRIPT_DIR / "wlasl_100"


class WLASLDataset(Dataset):
    def __init__(self, data_paths, labels, train=False, augment_noise=0.0, augment_drop=0.0):
        self.data_paths = list(data_paths)
        self.labels = list(labels)
        self.train = train
        self.augment_noise = float(augment_noise)
        self.augment_drop = float(augment_drop)

    def __len__(self):
        return len(self.data_paths)

    def __getitem__(self, idx):
        sequence = np.load(self.data_paths[idx], mmap_mode="r")
        sequence = np.asarray(sequence, dtype=np.float32)
        if self.train:
            if self.augment_noise > 0:
                noise = np.random.normal(0.0, self.augment_noise, size=sequence.shape).astype(np.float32)
                sequence = sequence + noise
            if self.augment_drop > 0:
                drop_mask = (np.random.rand(sequence.shape[0]) < self.augment_drop)
                sequence[drop_mask] = 0.0
        label = self.labels[idx]
        return torch.from_numpy(sequence.copy()), torch.tensor(label, dtype=torch.long)


class SignLanguageLSTM(nn.Module):
    """
    LayerNorm on the feature dimension helps a lot for heterogeneous MediaPipe
    channels (pose vs face vs hands). BiLSTM + dropout improves generalization.
    """

    def __init__(
        self,
        input_size,
        hidden_size,
        num_layers,
        num_classes,
        dropout=0.4,
        bidirectional=True,
        temporal_pooling="attention",
    ):
        super().__init__()
        self.input_norm = nn.LayerNorm(input_size)
        self.bidirectional = bidirectional
        self.temporal_pooling = temporal_pooling
        lstm_dropout = float(dropout) if num_layers > 1 else 0.0
        self.lstm = nn.LSTM(
            input_size,
            hidden_size,
            num_layers,
            batch_first=True,
            bidirectional=bidirectional,
            dropout=lstm_dropout,
        )
        d = 2 if bidirectional else 1
        self.attn = nn.Sequential(
            nn.Linear(hidden_size * d, hidden_size),
            nn.Tanh(),
            nn.Linear(hidden_size, 1),
        )
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_size * d, num_classes)

    def forward(self, x):
        x = self.input_norm(x)
        out, _ = self.lstm(x)
        if self.temporal_pooling == "attention":
            # Learn per-frame importance instead of relying only on final frame.
            scores = self.attn(out).squeeze(-1)  # (B, T)
            weights = torch.softmax(scores, dim=1).unsqueeze(-1)  # (B, T, 1)
            h = torch.sum(out * weights, dim=1)  # (B, H)
        elif self.temporal_pooling == "mean":
            h = torch.mean(out, dim=1)
        else:
            h = out[:, -1, :]
        h = self.dropout(h)
        return self.fc(h)

class SignLanguageTransformer(nn.Module):
    def __init__(
        self,
        input_size,
        hidden_size,
        num_layers,
        num_classes,
        dropout=0.3,
        nhead=4,
    ):
        super().__init__()
        self.input_norm = nn.LayerNorm(input_size)
        self.proj = nn.Linear(input_size, hidden_size)
        self.pos_emb = nn.Parameter(torch.randn(1, 64, hidden_size) * 0.02)
        enc_layer = nn.TransformerEncoderLayer(
            d_model=hidden_size,
            nhead=nhead,
            dim_feedforward=hidden_size * 4,
            dropout=dropout,
            batch_first=True,
            norm_first=True,
            activation="gelu",
        )
        self.encoder = nn.TransformerEncoder(enc_layer, num_layers=num_layers)
        self.cls = nn.Parameter(torch.zeros(1, 1, hidden_size))
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_size, num_classes)

    def forward(self, x):
        x = self.input_norm(x)
        x = self.proj(x)
        t = x.shape[1]
        pos = self.pos_emb[:, :t, :]
        x = x + pos
        cls = self.cls.expand(x.shape[0], -1, -1)
        x = torch.cat([cls, x], dim=1)
        x = self.encoder(x)
        h = self.dropout(x[:, 0, :])
        return self.fc(h)


def discover_class_names(wlasl_root: Path, split_names: list[str], feature_subdir: str) -> list[str]:
    """Union of class folder names across splits (sorted)."""
    names: set[str] = set()
    for split in split_names:
        root = wlasl_root / split / feature_subdir
        if not root.is_dir():
            continue
        names.update(d.name for d in root.iterdir() if d.is_dir())
    if not names:
        raise FileNotFoundError(
            f"No class folders found under {[wlasl_root / s / 'features' for s in split_names]}"
        )
    return sorted(names)


def collect_features_from_splits(
    wlasl_root: Path,
    split_names: list[str],
    class_to_idx: dict[str, int],
    feature_subdir: str,
    desc: str = "Indexing samples",
):
    """
    Collect .npy paths from wlasl_root/<split>/features/<class>/*.npy
    using a fixed global class_to_idx.
    """
    wlasl_root = Path(wlasl_root).resolve()
    paths: list[str] = []
    labels: list[int] = []

    tasks: list[tuple[str, str, int]] = []
    for split in split_names:
        for class_name, idx in class_to_idx.items():
            d = wlasl_root / split / feature_subdir / class_name
            if d.is_dir():
                tasks.append((split, class_name, idx))

    for split, class_name, idx in tqdm(tasks, desc=desc, unit="class×split"):
        d = wlasl_root / split / feature_subdir / class_name
        for npy_path in sorted(d.glob("*.npy")):
            paths.append(str(npy_path))
            labels.append(idx)

    return paths, labels

def maybe_limit_classes(class_names: list[str], max_classes: int | None):
    if max_classes is None:
        return class_names
    return class_names[:max_classes]

class FocalLoss(nn.Module):
    def __init__(self, gamma=2.0, weight=None):
        super().__init__()
        self.gamma = gamma
        self.weight = weight

    def forward(self, logits, targets):
        ce = nn.functional.cross_entropy(logits, targets, reduction="none", weight=self.weight)
        pt = torch.exp(-ce)
        loss = ((1 - pt) ** self.gamma) * ce
        return loss.mean()

def class_weights_from_labels(labels: list[int], num_classes: int):
    counts = np.bincount(np.array(labels), minlength=num_classes).astype(np.float32)
    counts[counts == 0] = 1.0
    inv = 1.0 / counts
    weights = inv / inv.mean()
    return torch.tensor(weights, dtype=torch.float32)


def infer_input_size(sample_path: str) -> int:
    arr = np.load(sample_path)
    if arr.ndim != 2:
        raise ValueError(f"Expected 2D array (frames, features), got shape {arr.shape}")
    return int(arr.shape[1])


def default_eval_split(train_splits: list[str]) -> str | None:
    """
    Avoid evaluating on data that is included in training.
    - train only -> validate on val
    - train+val (or any split that includes val) -> validate on test
    """
    ts = set(train_splits)
    if ts <= {"train"}:
        return "val"
    if "val" in ts:
        return "test"
    return "val"


@torch.no_grad()
def evaluate(
    model: nn.Module,
    data_loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    desc: str,
):
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0

    pbar = tqdm(data_loader, desc=desc, leave=False, unit="batch")
    for sequences, labels in pbar:
        sequences = sequences.to(device)
        labels = labels.to(device)
        outputs = model(sequences)
        loss = criterion(outputs, labels)
        total_loss += loss.item()
        _, predicted = torch.max(outputs, 1)
        total += labels.size(0)
        correct += (predicted == labels).sum().item()
        pbar.set_postfix(loss=f"{loss.item():.4f}")

    model.train()
    n = max(len(data_loader), 1)
    return total_loss / n, 100.0 * correct / max(total, 1)


def train_model(
    model,
    train_loader,
    val_loader,
    criterion,
    optimizer,
    scheduler,
    epochs,
    device,
    grad_clip_norm: float,
    save_best_path: str | None = None,
):
    model.train()
    best_state = None
    best_val_acc = -1.0

    for epoch in range(epochs):
        total_loss = 0.0
        correct_predictions = 0
        total_samples = 0

        pbar = tqdm(
            train_loader,
            desc=f"Train {epoch + 1}/{epochs}",
            leave=True,
            unit="batch",
        )

        for sequences, labels in pbar:
            sequences = sequences.to(device)
            labels = labels.to(device)

            optimizer.zero_grad()
            outputs = model(sequences)
            loss = criterion(outputs, labels)
            loss.backward()
            if grad_clip_norm > 0:
                torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip_norm)
            optimizer.step()

            total_loss += loss.item()
            _, predicted = torch.max(outputs.data, 1)
            total_samples += labels.size(0)
            correct_predictions += (predicted == labels).sum().item()

            running_acc = 100.0 * correct_predictions / total_samples
            pbar.set_postfix(loss=f"{loss.item():.4f}", acc=f"{running_acc:.2f}%")

        epoch_loss = total_loss / max(len(train_loader), 1)
        epoch_acc = (correct_predictions / max(total_samples, 1)) * 100
        msg = (
            f"Epoch [{epoch + 1}/{epochs}] | Train loss: {epoch_loss:.4f} | "
            f"Train acc: {epoch_acc:.2f}%"
        )

        if val_loader is not None and len(val_loader.dataset) > 0:
            v_loss, v_acc = evaluate(
                model,
                val_loader,
                criterion,
                device,
                desc=f"Val {epoch + 1}/{epochs}",
            )
            msg += f" | Val loss: {v_loss:.4f} | Val acc: {v_acc:.2f}%"
            if scheduler is not None:
                scheduler.step(v_acc)
            if v_acc > best_val_acc:
                best_val_acc = v_acc
                best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        elif scheduler is not None:
            scheduler.step(epoch_acc)

        tqdm.write(msg)

    if best_state is not None:
        model.load_state_dict(best_state)
        tqdm.write(
            f"Loaded best checkpoint (val acc {best_val_acc:.2f}%) for any later evaluation."
        )
        if save_best_path:
            ckpt_path = Path(save_best_path)
            ckpt_path.parent.mkdir(parents=True, exist_ok=True)
            torch.save(best_state, ckpt_path)
            tqdm.write(f"Saved best checkpoint: {ckpt_path}")

    return model


@torch.no_grad()
def run_final_eval(
    model,
    data_loader,
    device,
    desc: str,
    num_classes: int,
):
    model.eval()
    correct = 0
    total = 0
    for sequences, labels in tqdm(data_loader, desc=desc, unit="batch"):
        sequences = sequences.to(device)
        labels = labels.to(device)
        outputs = model(sequences)
        _, predicted = torch.max(outputs, 1)
        total += labels.size(0)
        correct += (predicted == labels).sum().item()
    acc = 100.0 * correct / max(total, 1)
    chance = 100.0 / max(num_classes, 1)
    tqdm.write(
        f"{desc} | Accuracy: {acc:.2f}% ({correct}/{total}) "
        f"(uniform random ≈ {chance:.2f}% for {num_classes}-way)"
    )
    model.train()


def parse_args():
    p = argparse.ArgumentParser(
        description="Train WLASL-100 LSTM on MediaPipe feature .npy files."
    )
    p.add_argument(
        "--wlasl-root",
        type=Path,
        default=DEFAULT_WLASL_ROOT,
        help="Folder containing train/val/test subfolders with features/ (default: Training/wlasl_100)",
    )
    p.add_argument(
        "--feature-subdir",
        default="features_hands_pose_hand_gated",
        help="Feature folder name under each split.",
    )
    p.add_argument(
        "--train-splits",
        nargs="+",
        default=["train", "val"],
        help="Splits to merge for training (default: train val)",
    )
    p.add_argument(
        "--eval-split",
        default="auto",
        help="Per-epoch validation split. Default 'auto': val if training on train only, "
        "else test when val is in --train-splits. Use 'none' to skip.",
    )
    p.add_argument(
        "--final-eval-split",
        default=None,
        help="After training, run accuracy on this split (e.g. test). Default: none.",
    )
    p.add_argument("--epochs", type=int, default=50)
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--hidden-size", type=int, default=256)
    p.add_argument("--num-layers", type=int, default=2)
    p.add_argument("--dropout", type=float, default=0.4)
    p.add_argument(
        "--no-bidirectional",
        action="store_true",
        help="Use unidirectional LSTM (weaker, not recommended).",
    )
    p.add_argument("--weight-decay", type=float, default=1e-4)
    p.add_argument(
        "--grad-clip",
        type=float,
        default=1.0,
        help="Max grad norm (0 disables).",
    )
    p.add_argument(
        "--lr-patience",
        type=int,
        default=4,
        help="ReduceLROnPlateau patience (epochs without val improvement).",
    )
    p.add_argument(
        "--temporal-pooling",
        choices=["attention", "mean", "last"],
        default="attention",
        help="How to aggregate frame features after LSTM (default: attention).",
    )
    p.add_argument("--arch", choices=["lstm", "transformer"], default="transformer")
    p.add_argument("--max-classes", type=int, default=None, help="Use first N classes for easier sanity checks.")
    p.add_argument("--augment-noise", type=float, default=0.01, help="Gaussian noise std for train features.")
    p.add_argument("--augment-drop", type=float, default=0.1, help="Probability of dropping a whole frame.")
    p.add_argument("--loss", choices=["ce", "weighted_ce", "focal"], default="weighted_ce")
    p.add_argument("--focal-gamma", type=float, default=2.0)
    p.add_argument("--balanced-sampler", action="store_true", help="Sample classes more evenly each epoch.")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument(
        "--save-best-path",
        default=str(SCRIPT_DIR / "checkpoints" / "wlasl_best.pt"),
        help="Path to save best validation checkpoint state_dict.",
    )
    return p.parse_args()


def main():
    args = parse_args()
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)

    wlasl_root = args.wlasl_root.expanduser().resolve()
    if os.environ.get("WLASL_ROOT"):
        wlasl_root = Path(os.environ["WLASL_ROOT"]).expanduser().resolve()

    train_splits = args.train_splits
    eval_split = args.eval_split
    if eval_split is None or str(eval_split).lower() == "auto":
        eval_split = default_eval_split(train_splits)
    elif str(eval_split).lower() == "none":
        eval_split = None

    # Discover classes from all splits we might touch
    splits_for_discovery = list(train_splits)
    if eval_split:
        splits_for_discovery.append(eval_split)
    if args.final_eval_split:
        splits_for_discovery.append(args.final_eval_split)
    splits_for_discovery = list(dict.fromkeys(splits_for_discovery))
    class_names = discover_class_names(wlasl_root, splits_for_discovery, args.feature_subdir)
    class_names = maybe_limit_classes(class_names, args.max_classes)
    class_to_idx = {name: i for i, name in enumerate(class_names)}
    num_classes = len(class_names)

    print(f"WLASL root: {wlasl_root}")
    print(f"Train splits: {train_splits}")
    if eval_split:
        if eval_split in train_splits:
            tqdm.write(
                f"Warning: --eval-split {eval_split} overlaps with training; "
                "metrics will be optimistic."
            )
        print(f"Eval split (each epoch): {eval_split}")
    else:
        print("Per-epoch validation: off")

    train_paths, train_labels = collect_features_from_splits(
        wlasl_root, train_splits, class_to_idx, args.feature_subdir, desc="Indexing train"
    )
    if not train_paths:
        raise SystemExit("No training samples found. Run mediapipe_extraction.py first.")

    input_size = infer_input_size(train_paths[0])
    print(f"Train samples: {len(train_paths)} | Classes: {num_classes} | input_size: {input_size}")
    avg_per_class = len(train_paths) / max(num_classes, 1)
    if avg_per_class < 15:
        tqdm.write(
            f"\nWarning: low data density: ~{avg_per_class:.1f} train samples per class for {num_classes}-way "
            "classification. Expect weak generalization (your val≈25% / test≈16% pattern is typical).\n"
            "  Fix: re-extract with a larger metadata file so more videos are labeled, e.g.\n"
            '    python Training/mediapipe_extraction.py --dataset-root "<WLASL-FULL>" '
            "--metadata-json nslt_1000.json "
            "--output-subdir features_hands_pose_hand_gated_nslt1000\n"
            "  Then train with matching --feature-subdir. Also try --balanced-sampler and more epochs.\n"
        )

    val_loader = None
    if eval_split:
        val_paths, val_labels = collect_features_from_splits(
            wlasl_root, [eval_split], class_to_idx, args.feature_subdir, desc=f"Indexing {eval_split}"
        )
        if val_paths:
            val_ds = WLASLDataset(val_paths, val_labels, train=False)
            val_loader = DataLoader(
                val_ds,
                batch_size=args.batch_size,
                shuffle=False,
                num_workers=0,
            )
        else:
            tqdm.write(f"No samples in eval split '{eval_split}'; skipping validation.")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if args.arch == "lstm":
        model = SignLanguageLSTM(
            input_size,
            args.hidden_size,
            args.num_layers,
            num_classes,
            dropout=args.dropout,
            bidirectional=not args.no_bidirectional,
            temporal_pooling=args.temporal_pooling,
        ).to(device)
    else:
        model = SignLanguageTransformer(
            input_size,
            args.hidden_size,
            args.num_layers,
            num_classes,
            dropout=args.dropout,
        ).to(device)

    cls_weights = class_weights_from_labels(train_labels, num_classes).to(device)
    if args.loss == "ce":
        criterion = nn.CrossEntropyLoss()
    elif args.loss == "weighted_ce":
        criterion = nn.CrossEntropyLoss(weight=cls_weights)
    else:
        criterion = FocalLoss(gamma=args.focal_gamma, weight=cls_weights)
    optimizer = optim.AdamW(
        model.parameters(),
        lr=args.lr,
        weight_decay=args.weight_decay,
    )
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer,
        mode="max",
        factor=0.5,
        patience=args.lr_patience,
    )

    train_ds = WLASLDataset(
        train_paths,
        train_labels,
        train=True,
        augment_noise=args.augment_noise,
        augment_drop=args.augment_drop,
    )
    sampler = None
    shuffle = True
    if args.balanced_sampler:
        class_counts = np.bincount(np.array(train_labels), minlength=num_classes)
        sample_weights = [1.0 / max(class_counts[y], 1) for y in train_labels]
        sampler = WeightedRandomSampler(sample_weights, num_samples=len(sample_weights), replacement=True)
        shuffle = False

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=shuffle,
        sampler=sampler,
        num_workers=0,
        pin_memory=device.type == "cuda",
    )

    model = train_model(
        model,
        train_loader,
        val_loader,
        criterion,
        optimizer,
        scheduler,
        args.epochs,
        device,
        grad_clip_norm=args.grad_clip,
        save_best_path=args.save_best_path,
    )

    if args.final_eval_split:
        fe = args.final_eval_split
        paths, labs = collect_features_from_splits(
            wlasl_root, [fe], class_to_idx, args.feature_subdir, desc=f"Indexing {fe} (final)"
        )
        if paths:
            loader = DataLoader(
                WLASLDataset(paths, labs),
                batch_size=args.batch_size,
                shuffle=False,
                num_workers=0,
            )
            run_final_eval(
                model,
                loader,
                device,
                desc=f"Final eval ({fe})",
                num_classes=num_classes,
            )
        else:
            tqdm.write(f"No samples for --final-eval-split {fe}; skipping.")


if __name__ == "__main__":
    main()
