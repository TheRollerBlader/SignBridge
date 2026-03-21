import cv2
import argparse
import numpy as np
import sys
import json
import os
import warnings
from pathlib import Path

# MediaPipe 0.10.x is stable on Python 3.11 in this project.
# Guard early to avoid a hard abort seen on Python 3.12.
if sys.version_info[:2] != (3, 11):
    raise SystemExit(
        "This script requires Python 3.11 for MediaPipe.\n"
        "Use: source .venv311/bin/activate && python Training/mediapipe_extraction.py"
    )

# Reduce noisy C++/TF logs so tqdm progress remains readable.
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("GLOG_minloglevel", "2")
warnings.filterwarnings("ignore", category=UserWarning, module="google.protobuf")

import mediapipe as mp
from tqdm import tqdm

# Initialize MediaPipe Holistic
mp_holistic = mp.solutions.holistic
SCRIPT_DIR = Path(__file__).resolve().parent
FEATURE_SET_SIZES = {
    "full": 1662,
    "hands_pose": 258,
    "hands_only": 126,
}

def progress(iterable, desc, unit):
    # Force tqdm output to stdout so progress is visible in terminal sessions.
    return tqdm(
        iterable,
        desc=desc,
        unit=unit,
        dynamic_ncols=True,
        file=sys.stdout,
        disable=False,
    )

def extract_keypoints(results, feature_set="hands_pose"):
    """
    Extracts flattened landmarks from MediaPipe results based on feature_set.
    """
    # Pose: 33 landmarks * 4 values (x, y, z, visibility) = 132
    pose = np.array([[res.x, res.y, res.z, res.visibility] for res in results.pose_landmarks.landmark]).flatten() if results.pose_landmarks else np.zeros(33*4)
    
    # Face: 468 landmarks * 3 values (x, y, z) = 1404
    face = np.array([[res.x, res.y, res.z] for res in results.face_landmarks.landmark]).flatten() if results.face_landmarks else np.zeros(468*3)
    
    # Left Hand: 21 landmarks * 3 values (x, y, z) = 63
    lh = np.array([[res.x, res.y, res.z] for res in results.left_hand_landmarks.landmark]).flatten() if results.left_hand_landmarks else np.zeros(21*3)
    
    # Right Hand: 21 landmarks * 3 values (x, y, z) = 63
    rh = np.array([[res.x, res.y, res.z] for res in results.right_hand_landmarks.landmark]).flatten() if results.right_hand_landmarks else np.zeros(21*3)
    
    if feature_set == "full":
        return np.concatenate([pose, face, lh, rh])
    if feature_set == "hands_only":
        return np.concatenate([lh, rh])
    return np.concatenate([pose, lh, rh])

def has_hand(results):
    return results.left_hand_landmarks is not None or results.right_hand_landmarks is not None

def process_frame_sequence(frame_paths, max_frames=50, feature_set="hands_pose", require_hand=True):
    """
    Reads a sequence of image frames and extracts landmarks frame by frame.
    If require_hand=True, only frames with a visible hand are used.
    Pads/truncates the resulting sequence to max_frames.
    """
    sequence = []

    # Set up the MediaPipe holistic model
    with mp_holistic.Holistic(min_detection_confidence=0.5, min_tracking_confidence=0.5) as holistic:
        for frame_path in frame_paths:
            frame = cv2.imread(str(frame_path))
            if frame is None:
                continue

            # Recolor feed to RGB for MediaPipe
            image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image.flags.writeable = False

            # Make detections
            results = holistic.process(image)

            if require_hand and not has_hand(results):
                continue

            # Extract keypoints and add to sequence
            keypoints = extract_keypoints(results, feature_set=feature_set)
            sequence.append(keypoints)

            # Optional: break early if we hit max_frames to save processing time
            if len(sequence) == max_frames:
                break

    sequence = np.array(sequence)

    # Handle variable video lengths by padding or truncating
    if len(sequence) == 0:
        # No valid hand frames found (or unreadable folder).
        return None

    if len(sequence) < max_frames:
        # Pad with zeros at the end if the video is shorter than max_frames
        padding = np.zeros((max_frames - len(sequence), FEATURE_SET_SIZES[feature_set]))
        sequence = np.vstack((sequence, padding))
    else:
        # Truncate if the video is longer than max_frames
        sequence = sequence[:max_frames]
        
    return sequence.astype(np.float32)

def sorted_frame_paths(frame_dir):
    """
    Returns sorted frame image paths for one sample folder.
    """
    frame_dir = Path(frame_dir)
    frame_paths = [p for p in frame_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}]
    # Filenames are typically like sign_0.jpg, sign_1.jpg ... sign_10.jpg
    # Sorting by extracted integer keeps frame order stable.
    frame_paths.sort(key=lambda p: int("".join(filter(str.isdigit, p.stem)) or 0))
    return frame_paths

def process_video_file(video_path, max_frames=50, feature_set="hands_pose", require_hand=True):
    """
    Extracts a fixed-length keypoint sequence from a video file.
    If require_hand=True, only frames with a visible hand are used.
    Returns None if no valid frames are collected.
    """
    sequence = []
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None

    with mp_holistic.Holistic(min_detection_confidence=0.5, min_tracking_confidence=0.5) as holistic:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image.flags.writeable = False
            results = holistic.process(image)

            if require_hand and not has_hand(results):
                continue

            keypoints = extract_keypoints(results, feature_set=feature_set)
            sequence.append(keypoints)

            if len(sequence) == max_frames:
                break

    cap.release()
    if len(sequence) == 0:
        return None

    sequence = np.array(sequence)
    if len(sequence) < max_frames:
        padding = np.zeros((max_frames - len(sequence), FEATURE_SET_SIZES[feature_set]))
        sequence = np.vstack((sequence, padding))
    else:
        sequence = sequence[:max_frames]
    return sequence.astype(np.float32)

def load_class_names_from_file(class_file_path):
    """
    Reads 'wlasl_class_list.txt' lines in the format:
      <id>\\t<label>
    """
    class_names = {}
    with open(class_file_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t", 1)
            if len(parts) != 2:
                continue
            class_id, class_name = parts
            class_names[int(class_id)] = class_name
    return class_names

def build_dataset_from_video_metadata(
    dataset_root,
    metadata_file="nslt_100.json",
    videos_subdir="videos",
    class_list_file="wlasl_class_list.txt",
    output_subdir="features_hands_pose_hand_gated",
    max_frames=50,
    feature_set="hands_pose",
    require_hand=True,
):
    """
    Supports WLASL-style folder:
      dataset_root/
        videos/*.mp4
        nslt_100.json (video_id -> {subset, action})
        wlasl_class_list.txt
    """
    dataset_root = Path(dataset_root)
    metadata_path = dataset_root / metadata_file
    videos_root = dataset_root / videos_subdir
    class_list_path = dataset_root / class_list_file

    if not metadata_path.exists() or not videos_root.exists():
        raise FileNotFoundError(
            f"Could not find required files for video-mode extraction:\n"
            f"- metadata: {metadata_path}\n"
            f"- videos:   {videos_root}"
        )

    with open(metadata_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)
    class_names = load_class_names_from_file(class_list_path) if class_list_path.exists() else {}

    counters = {
        "train": {"saved": 0, "missing_video": 0, "no_hand": 0},
        "val": {"saved": 0, "missing_video": 0, "no_hand": 0},
        "test": {"saved": 0, "missing_video": 0, "no_hand": 0},
    }

    items = list(metadata.items())
    pbar = progress(items, desc="Extracting videos", unit="video")
    for video_id, info in pbar:
        subset = info.get("subset")
        if subset not in counters:
            continue

        action = info.get("action", [])
        class_id = int(action[0]) if action else -1
        class_name = class_names.get(class_id, f"class_{class_id}")
        video_path = videos_root / f"{video_id}.mp4"
        if not video_path.exists():
            counters[subset]["missing_video"] += 1
            continue

        sequence_data = process_video_file(
            video_path,
            max_frames=max_frames,
            feature_set=feature_set,
            require_hand=require_hand,
        )
        if sequence_data is None:
            counters[subset]["no_hand"] += 1
            continue

        save_dir = dataset_root / subset / output_subdir / class_name
        save_dir.mkdir(parents=True, exist_ok=True)
        np.save(save_dir / f"{video_id}.npy", sequence_data)
        counters[subset]["saved"] += 1
        pbar.set_postfix(
            train=counters["train"]["saved"],
            val=counters["val"]["saved"],
            test=counters["test"]["saved"],
        )

    for split, c in counters.items():
        print(
            f"{split}: extracted {c['saved']} samples into {dataset_root / split / output_subdir} "
            f"(missing_video={c['missing_video']}, skipped_no_hand={c['no_hand']})"
        )

def build_split_dataset(
    split_dir,
    input_subdir="frames",
    output_subdir="features",
    max_frames=50,
    feature_set="hands_pose",
    require_hand=True,
):
    """
    Processes one split folder (train/val/test) from:
      split_dir/frames/<label>/<sample_id>/*.jpg
    and saves to:
      split_dir/features/<label>/<sample_id>.npy
    """
    split_dir = Path(split_dir)
    input_root = split_dir / input_subdir
    output_root = split_dir / output_subdir
    output_root.mkdir(parents=True, exist_ok=True)

    if not input_root.exists():
        print(f"Skipping {split_dir.name}: {input_root} does not exist.")
        return

    total_samples = 0
    skipped_no_hand = 0
    label_dirs = sorted([p for p in input_root.iterdir() if p.is_dir()])
    pbar_labels = progress(label_dirs, desc=f"{split_dir.name}: labels", unit="label")
    for label_dir in pbar_labels:
        sample_dirs = sorted([p for p in label_dir.iterdir() if p.is_dir()])
        for sample_dir in sample_dirs:
            frame_paths = sorted_frame_paths(sample_dir)
            if not frame_paths:
                continue

            print(f"Processing {split_dir.name}/{label_dir.name}/{sample_dir.name} ...")
            sequence_data = process_frame_sequence(
                frame_paths,
                max_frames=max_frames,
                feature_set=feature_set,
                require_hand=require_hand,
            )
            if sequence_data is None:
                skipped_no_hand += 1
                continue

            save_dir = output_root / label_dir.name
            save_dir.mkdir(parents=True, exist_ok=True)
            save_path = save_dir / f"{sample_dir.name}.npy"
            np.save(save_path, sequence_data)
            total_samples += 1
            pbar_labels.set_postfix(saved=total_samples, skipped_no_hand=skipped_no_hand)

    print(
        f"{split_dir.name}: extracted {total_samples} samples into {output_root} "
        f"(skipped_no_hand={skipped_no_hand})"
    )

def build_dataset(
    dataset_root="./wlasl_100",
    splits=("train", "val", "test"),
    max_frames=50,
    feature_set="hands_pose",
    output_subdir=None,
    require_hand=True,
    metadata_json="nslt_100.json",
):
    """
    Runs feature extraction for all requested dataset splits.
    """
    dataset_root = Path(dataset_root)
    if not dataset_root.is_absolute():
        dataset_root = (SCRIPT_DIR / dataset_root).resolve()

    if output_subdir is None:
        suffix = "hand_gated" if require_hand else "all_frames"
        output_subdir = f"features_{feature_set}_{suffix}"

    # Auto-detect dataset layout:
    # 1) split/frames/* (existing behavior)
    # 2) videos + nslt_100.json (WLASL full metadata format)
    has_frames_layout = any((dataset_root / s / "frames").exists() for s in splits)
    metadata_path = dataset_root / metadata_json
    has_video_layout = (dataset_root / "videos").exists() and metadata_path.exists()

    if not has_frames_layout and has_video_layout:
        build_dataset_from_video_metadata(
            dataset_root=dataset_root,
            metadata_file=metadata_json,
            output_subdir=output_subdir,
            max_frames=max_frames,
            feature_set=feature_set,
            require_hand=require_hand,
        )
        print("Feature extraction complete!")
        return

    for split in splits:
        build_split_dataset(
            dataset_root / split,
            output_subdir=output_subdir,
            max_frames=max_frames,
            feature_set=feature_set,
            require_hand=require_hand,
        )

    print("Feature extraction complete!")

def parse_args():
    parser = argparse.ArgumentParser(description="Extract MediaPipe landmarks for WLASL folder splits.")
    parser.add_argument("--dataset-root", default="wlasl_100")
    parser.add_argument("--max-frames", type=int, default=50)
    parser.add_argument(
        "--feature-set",
        choices=["full", "hands_pose", "hands_only"],
        default="hands_pose",
        help="full=1662, hands_pose=258, hands_only=126",
    )
    parser.add_argument(
        "--output-subdir",
        default=None,
        help="Override output folder name inside each split (default: features_<feature-set>).",
    )
    parser.add_argument(
        "--allow-no-hand",
        action="store_true",
        help="Disable hand gating and use all frames.",
    )
    parser.add_argument(
        "--metadata-json",
        default="nslt_100.json",
        help=(
            "WLASL-FULL layout only: JSON under dataset-root listing train/val/test clips "
            "(e.g. nslt_300.json, nslt_1000.json for many more samples than nslt_100.json)."
        ),
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    build_dataset(
        dataset_root=args.dataset_root,
        max_frames=args.max_frames,
        feature_set=args.feature_set,
        output_subdir=args.output_subdir,
        require_hand=(not args.allow_no_hand),
        metadata_json=args.metadata_json,
    )