"""
Load WLASL PyTorch checkpoint (same architecture as repo root wlasl_demo.py) for HTTP inference.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
import torch

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import wlasl_demo as wd  # noqa: E402


_WLASL_100_GLOSSES = [
    "accident", "africa", "all", "apple", "basketball", "bed", "before",
    "bird", "birthday", "black", "blue", "book", "bowling", "brown", "but",
    "can", "candy", "chair", "change", "cheat", "city", "clothes", "color",
    "computer", "cook", "cool", "corn", "cousin", "cow", "dance", "dark",
    "deaf", "decide", "doctor", "dog", "drink", "eat", "enjoy", "family",
    "fine", "finish", "fish", "forget", "full", "give", "go", "graduate",
    "hat", "hearing", "help", "hot", "how", "jacket", "kiss", "language",
    "last", "later", "letter", "like", "man", "many", "medicine", "meet",
    "mother", "need", "no", "now", "orange", "paint", "paper", "pink",
    "pizza", "play", "pull", "purple", "right", "same", "school",
    "secretary", "shirt", "short", "son", "study", "table", "tall", "tell",
    "thanksgiving", "thin", "thursday", "time", "walk", "want", "what",
    "white", "who", "woman", "work", "wrong", "year", "yes",
]


def _load_labels(num_classes: int) -> list[str]:
    path = os.environ.get("WLASL_LABELS_PATH")
    if path:
        p = Path(path).expanduser().resolve()
        if p.suffix.lower() == ".json":
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, list) and len(data) == num_classes:
                return [str(x) for x in data]
        else:
            lines = [ln.strip() for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip()]
            if len(lines) == num_classes:
                return lines

    if num_classes == 100:
        return list(_WLASL_100_GLOSSES)

    wlasl_root = os.environ.get("WLASL_ROOT")
    feature_subdir = os.environ.get("WLASL_FEATURE_SUBDIR", "features_hands_pose_hand_gated")
    if wlasl_root:
        root = Path(wlasl_root).expanduser().resolve()
        splits = os.environ.get("WLASL_CLASS_SPLITS", "train,val").split(",")
        splits = [s.strip() for s in splits if s.strip()]
        try:
            root, fs = wd.resolve_wlasl_paths(root, feature_subdir, splits)
            names = wd.discover_class_names(root, fs, splits, None)
            if len(names) == num_classes:
                return names
        except (FileNotFoundError, OSError, ValueError):
            pass

    return [f"class_{i}" for i in range(num_classes)]


class WlaslEngine:
    def __init__(self) -> None:
        self.model: torch.nn.Module | None = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.labels: list[str] = []
        self.max_frames: int = int(os.environ.get("WLASL_MAX_FRAMES", "50"))
        self.input_size: int = 258
        self.error: str | None = None

    def load(self) -> None:
        ck = os.environ.get("WLASL_CHECKPOINT", str(_REPO_ROOT / "Models" / "2000_common_word" / "wlasl_best.pt"))
        ck_path = Path(ck).expanduser().resolve()
        if not ck_path.is_file():
            self.error = f"WLASL checkpoint not found: {ck_path}"
            return

        arch = os.environ.get("WLASL_ARCH")
        if arch and arch != "auto":
            arch_override = arch
        else:
            arch_override = None

        try:
            model, _arch, num_classes = wd.load_model_from_checkpoint(
                ck_path,
                self.device,
                arch_override=arch_override,
                dropout=float(os.environ.get("WLASL_DROPOUT", "0.4")),
                lstm_no_bidirectional=os.environ.get("WLASL_LSTM_NO_BIDIRECTIONAL", "").lower() in ("1", "true", "yes"),
                lstm_temporal_pooling=os.environ.get("WLASL_LSTM_TEMPORAL_POOLING") or None,
            )
        except Exception as e:
            self.error = str(e)
            return

        self.model = model
        self.model.eval()
        self.labels = _load_labels(num_classes)
        if len(self.labels) != num_classes:
            self.labels = [f"class_{i}" for i in range(num_classes)]

        try:
            self.input_size = int(model.input_norm.normalized_shape[0])
        except Exception:
            self.input_size = 258

        self.error = None

    def predict(self, frames: np.ndarray, max_frames_override: int | None = None) -> tuple[int, float, str]:
        if self.model is None:
            raise RuntimeError(self.error or "WLASL model not loaded")

        x = np.asarray(frames, dtype=np.float32)
        if x.ndim != 2:
            raise ValueError(f"frames must be 2D (T, F), got {x.shape}")
        if x.shape[1] != self.input_size:
            raise ValueError(f"Expected feature dim {self.input_size}, got {x.shape[1]}")

        cap = min(int(max_frames_override or self.max_frames), 128)
        t, f = x.shape
        if t > cap:
            x = x[:cap]
        elif t < cap:
            pad = np.zeros((cap - t, f), dtype=np.float32)
            x = np.vstack([x, pad])

        with torch.no_grad():
            logits = self.model(torch.from_numpy(x).unsqueeze(0).to(self.device))
            probs = torch.softmax(logits, dim=1).squeeze(0).cpu().numpy()

        idx = int(np.argmax(probs))
        conf = float(probs[idx])
        label = self.labels[idx] if 0 <= idx < len(self.labels) else str(idx)
        return idx, conf, label


_engine: WlaslEngine | None = None


def get_engine() -> WlaslEngine:
    global _engine
    if _engine is None:
        _engine = WlaslEngine()
        _engine.load()
    return _engine
