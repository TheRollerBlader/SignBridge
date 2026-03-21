import argparse
import csv
import re
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset


class WLASLDataset(Dataset):
    def __init__(self, data_paths, labels):
        self.data_paths = list(data_paths)
        self.labels = list(labels)

    def __len__(self):
        return len(self.data_paths)

    def __getitem__(self, idx):
        sequence = np.load(self.data_paths[idx], mmap_mode="r")
        sequence = np.asarray(sequence, dtype=np.float32)
        label = self.labels[idx]
        return torch.from_numpy(sequence.copy()), torch.tensor(label, dtype=torch.long)


class SignLanguageTransformer(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, num_classes, dropout=0.3, nhead=4):
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
        x = x + self.pos_emb[:, :t, :]
        cls = self.cls.expand(x.shape[0], -1, -1)
        x = torch.cat([cls, x], dim=1)
        x = self.encoder(x)
        h = self.dropout(x[:, 0, :])
        return self.fc(h)


def parse_training_runs(terminal_text: str):
    pattern = re.compile(
        r"Epoch \[(\d+)/(\d+)\] \| Train loss: ([0-9.]+) \| Train acc: ([0-9.]+)% \| Val loss: ([0-9.]+) \| Val acc: ([0-9.]+)%"
    )
    runs = []
    current = []
    prev_epoch = 0

    for line in terminal_text.splitlines():
        m = pattern.search(line)
        if not m:
            continue
        epoch = int(m.group(1))
        total = int(m.group(2))
        row = {
            "epoch": epoch,
            "total": total,
            "train_loss": float(m.group(3)),
            "train_acc": float(m.group(4)),
            "val_loss": float(m.group(5)),
            "val_acc": float(m.group(6)),
        }
        if epoch == 1 and current:
            runs.append(current)
            current = [row]
            prev_epoch = 1
            continue
        if epoch < prev_epoch and current:
            runs.append(current)
            current = [row]
        else:
            current.append(row)
        prev_epoch = epoch

    if current:
        runs.append(current)
    return runs


def save_curve_plots(runs, out_dir: Path):
    for i, run in enumerate(runs, start=1):
        epochs = [r["epoch"] for r in run]
        train_loss = [r["train_loss"] for r in run]
        val_loss = [r["val_loss"] for r in run]
        train_acc = [r["train_acc"] for r in run]
        val_acc = [r["val_acc"] for r in run]

        fig, ax = plt.subplots(1, 2, figsize=(14, 5))
        ax[0].plot(epochs, train_loss, label="train_loss")
        ax[0].plot(epochs, val_loss, label="val_loss")
        ax[0].set_title(f"Run {i}: Loss")
        ax[0].set_xlabel("Epoch")
        ax[0].set_ylabel("Loss")
        ax[0].legend()
        ax[0].grid(alpha=0.3)

        ax[1].plot(epochs, train_acc, label="train_acc")
        ax[1].plot(epochs, val_acc, label="val_acc")
        ax[1].set_title(f"Run {i}: Accuracy")
        ax[1].set_xlabel("Epoch")
        ax[1].set_ylabel("Accuracy (%)")
        ax[1].legend()
        ax[1].grid(alpha=0.3)

        fig.tight_layout()
        fig.savefig(out_dir / f"run_{i}_curves.png", dpi=160)
        plt.close(fig)


def collect_split_paths(wlasl_root: Path, feature_subdir: str, split: str, class_names):
    paths, labels = [], []
    for i, cname in enumerate(class_names):
        d = wlasl_root / split / feature_subdir / cname
        if d.exists():
            for p in sorted(d.glob("*.npy")):
                paths.append(str(p))
                labels.append(i)
    return paths, labels


@torch.no_grad()
def predict(model, loader, device):
    y_true, y_pred = [], []
    for x, y in loader:
        x = x.to(device)
        logits = model(x)
        pred = torch.argmax(logits, dim=1).cpu().numpy()
        y_true.extend(y.numpy().tolist())
        y_pred.extend(pred.tolist())
    return np.array(y_true), np.array(y_pred)


def confusion_matrix_np(y_true, y_pred, n):
    cm = np.zeros((n, n), dtype=np.int64)
    for t, p in zip(y_true, y_pred):
        cm[t, p] += 1
    return cm


def plot_confusion(cm, title, out_path: Path):
    fig, ax = plt.subplots(figsize=(10, 8))
    im = ax.imshow(cm, interpolation="nearest", cmap="Blues")
    ax.set_title(title)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(out_path, dpi=170)
    plt.close(fig)


def save_per_class_accuracy(cm, class_names, out_dir: Path, prefix: str):
    true_counts = cm.sum(axis=1).astype(float)
    correct = np.diag(cm).astype(float)
    acc = np.divide(correct, np.maximum(true_counts, 1), where=true_counts >= 0)

    rows = []
    for i, name in enumerate(class_names):
        rows.append((name, int(correct[i]), int(true_counts[i]), float(acc[i])))
    rows.sort(key=lambda x: x[3], reverse=True)

    csv_path = out_dir / f"{prefix}_per_class_accuracy.csv"
    with csv_path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["class", "correct", "total", "accuracy"])
        for r in rows:
            w.writerow(r)

    top = rows[:15]
    bottom = rows[-15:]

    for name, subset in [("best15", top), ("worst15", bottom)]:
        labels = [r[0] for r in subset]
        vals = [r[3] * 100 for r in subset]
        fig, ax = plt.subplots(figsize=(10, 6))
        y = np.arange(len(labels))
        ax.barh(y, vals, color="#4e79a7")
        ax.set_yticks(y)
        ax.set_yticklabels(labels)
        ax.set_xlim(0, 100)
        ax.set_xlabel("Accuracy (%)")
        ax.set_title(f"{prefix.upper()} per-class accuracy ({name})")
        ax.grid(axis="x", alpha=0.3)
        fig.tight_layout()
        fig.savefig(out_dir / f"{prefix}_{name}_class_accuracy.png", dpi=170)
        plt.close(fig)


def write_summary(out_dir: Path, runs, val_acc, test_acc):
    latest = runs[-1] if runs else []
    best_val_curve = max((r["val_acc"] for r in latest), default=0.0)
    final_val_curve = latest[-1]["val_acc"] if latest else 0.0
    final_train_curve = latest[-1]["train_acc"] if latest else 0.0
    with (out_dir / "summary.txt").open("w") as f:
        f.write("WLASL Visual Report\n")
        f.write("===================\n\n")
        f.write(f"Parsed runs: {len(runs)}\n")
        f.write(f"Latest run epochs: {len(latest)}\n")
        f.write(f"Latest run final train acc: {final_train_curve:.2f}%\n")
        f.write(f"Latest run final val acc: {final_val_curve:.2f}%\n")
        f.write(f"Latest run best val acc: {best_val_curve:.2f}%\n")
        f.write(f"Checkpoint val acc (recomputed): {val_acc:.2f}%\n")
        f.write(f"Checkpoint test acc (recomputed): {test_acc:.2f}%\n")

def write_html_report(out_dir: Path):
    summary = (out_dir / "summary.txt").read_text(encoding="utf-8")
    images = [
        "run_1_curves.png",
        "run_2_curves.png",
        "run_3_curves.png",
        "val_confusion_matrix.png",
        "test_confusion_matrix.png",
        "val_best15_class_accuracy.png",
        "val_worst15_class_accuracy.png",
        "test_best15_class_accuracy.png",
        "test_worst15_class_accuracy.png",
    ]
    img_html = "\n".join(
        f'<h3>{img}</h3><img src="{img}" style="max-width:100%;border:1px solid #ccc;border-radius:8px;" />'
        for img in images
        if (out_dir / img).exists()
    )

    html = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>WLASL Report</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 24px; }}
    pre {{ background:#f7f7f7; padding:12px; border-radius:8px; }}
    .section {{ margin-bottom: 28px; }}
    a {{ color:#0366d6; }}
  </style>
</head>
<body>
  <h1>WLASL Training/Test Report</h1>
  <div class="section">
    <h2>Summary</h2>
    <pre>{summary}</pre>
  </div>
  <div class="section">
    <h2>Visualizations</h2>
    {img_html}
  </div>
  <div class="section">
    <h2>CSV Exports</h2>
    <ul>
      <li><a href="val_per_class_accuracy.csv">val_per_class_accuracy.csv</a></li>
      <li><a href="test_per_class_accuracy.csv">test_per_class_accuracy.csv</a></li>
    </ul>
  </div>
</body>
</html>
"""
    (out_dir / "report.html").write_text(html, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Create visual report for WLASL training/testing.")
    parser.add_argument("--terminal-log", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--wlasl-root", required=True)
    parser.add_argument("--feature-subdir", default="features_hands_pose")
    parser.add_argument("--output-dir", default="Training/reports/latest")
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()

    out_dir = Path(args.output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    log_text = Path(args.terminal_log).read_text(encoding="utf-8", errors="ignore")
    runs = parse_training_runs(log_text)
    save_curve_plots(runs, out_dir)

    wlasl_root = Path(args.wlasl_root).resolve()
    class_names = sorted([d.name for d in (wlasl_root / "train" / args.feature_subdir).iterdir() if d.is_dir()])

    model = SignLanguageTransformer(
        input_size=258,
        hidden_size=256,
        num_layers=2,
        num_classes=len(class_names),
        dropout=0.3,
    )
    state = torch.load(args.checkpoint, map_location="cpu")
    model.load_state_dict(state)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device).eval()

    val_paths, val_labels = collect_split_paths(wlasl_root, args.feature_subdir, "val", class_names)
    test_paths, test_labels = collect_split_paths(wlasl_root, args.feature_subdir, "test", class_names)

    val_loader = DataLoader(WLASLDataset(val_paths, val_labels), batch_size=args.batch_size, shuffle=False)
    test_loader = DataLoader(WLASLDataset(test_paths, test_labels), batch_size=args.batch_size, shuffle=False)

    yv, pv = predict(model, val_loader, device)
    yt, pt = predict(model, test_loader, device)

    cm_val = confusion_matrix_np(yv, pv, len(class_names))
    cm_test = confusion_matrix_np(yt, pt, len(class_names))

    plot_confusion(cm_val, "Validation Confusion Matrix", out_dir / "val_confusion_matrix.png")
    plot_confusion(cm_test, "Test Confusion Matrix", out_dir / "test_confusion_matrix.png")

    save_per_class_accuracy(cm_val, class_names, out_dir, "val")
    save_per_class_accuracy(cm_test, class_names, out_dir, "test")

    val_acc = (yv == pv).mean() * 100 if len(yv) else 0.0
    test_acc = (yt == pt).mean() * 100 if len(yt) else 0.0
    write_summary(out_dir, runs, val_acc, test_acc)
    write_html_report(out_dir)

    print(f"Report generated in: {out_dir}")


if __name__ == "__main__":
    main()

