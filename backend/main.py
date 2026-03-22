import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import csv
import itertools
import copy
from ai_edge_litert.interpreter import Interpreter

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def load_labels(csv_path):
    with open(csv_path, encoding='utf-8-sig') as f:
        return [row[0] for row in csv.reader(f)]

def resolve_asset_path(filename):
    base_dir = Path(__file__).resolve().parent.parent
    candidates = [
        base_dir / filename,
        base_dir / "Models" / "Fingerspelling" / filename,
        base_dir / "Models" / "Fingerspelling Model" / filename,
    ]

    for path in candidates:
        if path.exists():
            return path

    searched = "\n".join(str(p) for p in candidates)
    raise FileNotFoundError(f"Could not find '{filename}'. Searched:\n{searched}")

def pre_process_landmark(landmark_list):
    temp_landmark_list = copy.deepcopy(landmark_list)
    base_x, base_y = 0, 0
    for index, landmark_point in enumerate(temp_landmark_list):
        if index == 0:
            base_x, base_y = landmark_point[0], landmark_point[1]
        temp_landmark_list[index][0] = temp_landmark_list[index][0] - base_x
        temp_landmark_list[index][1] = temp_landmark_list[index][1] - base_y

    temp_landmark_list = list(itertools.chain.from_iterable(temp_landmark_list))

    max_value = max(list(map(abs, temp_landmark_list)))
    def normalize_(n):
        return n / max_value if max_value != 0 else 0
    
    return list(map(normalize_, temp_landmark_list))

interpreter = None
labels = None
input_details = None
output_details = None

try:
    model_path = resolve_asset_path("keypoint_classifier.tflite")
    labels_path = resolve_asset_path("keypoint_classifier_label.csv")
    
    interpreter = Interpreter(model_path=str(model_path))
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()[0]
    output_details = interpreter.get_output_details()[0]
    
    labels = load_labels(labels_path)
    print("Model loaded successfully")
except Exception as e:
    print(f"Error loading model: {e}")

class Point(BaseModel):
    x: float
    y: float
    z: float

class LandmarkRequest(BaseModel):
    landmarks: List[Point]
    width: int
    height: int

@app.post("/predict")
async def predict_sign(request: LandmarkRequest):
    if not interpreter or not labels:
        raise HTTPException(status_code=500, detail="Model not loaded")

    if len(request.landmarks) != 21:
        raise HTTPException(status_code=400, detail="Expected 21 landmarks")

    image_width = request.width
    image_height = request.height

    landmark_list = []
    for landmark in request.landmarks:
        landmark_x = min(int(landmark.x * image_width), image_width - 1)
        landmark_y = min(int(landmark.y * image_height), image_height - 1)
        landmark_list.append([landmark_x, landmark_y])

    processed_landmarks = pre_process_landmark(landmark_list)

    input_data = np.array([processed_landmarks], dtype=np.float32)
    interpreter.set_tensor(input_details['index'], input_data)
    interpreter.invoke()

    prediction = interpreter.get_tensor(output_details['index'])
    best_guess_index = int(np.argmax(np.squeeze(prediction)))
    confidence = float(np.squeeze(prediction)[best_guess_index])

    if confidence > 0.80:
        english_letter = labels[best_guess_index]
        return {"letter": english_letter, "confidence": confidence}
    else:
        return {"letter": None, "confidence": confidence}
