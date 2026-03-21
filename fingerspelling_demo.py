import cv2
import mediapipe as mp
import numpy as np
import csv
import itertools
import copy
from pathlib import Path
from ai_edge_litert.interpreter import Interpreter

# Load the labels (A-Z) from the CSV
def load_labels(csv_path):
    with open(csv_path, encoding='utf-8-sig') as f:
        return [row[0] for row in csv.reader(f)]


def resolve_asset_path(filename):
    base_dir = Path(__file__).resolve().parent
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

# The crucial math step: Convert raw pixels into normalized, relative coordinates
def pre_process_landmark(image, landmarks):
    image_width, image_height = image.shape[1], image.shape[0]
    landmark_list = []

    # 1. Convert normalized MediaPipe coordinates to pixel coordinates
    for _, landmark in enumerate(landmarks.landmark):
        landmark_x = min(int(landmark.x * image_width), image_width - 1)
        landmark_y = min(int(landmark.y * image_height), image_height - 1)
        landmark_list.append([landmark_x, landmark_y])

    temp_landmark_list = copy.deepcopy(landmark_list)

    # 2. Make everything relative to the wrist (landmark 0)
    base_x, base_y = 0, 0
    for index, landmark_point in enumerate(temp_landmark_list):
        if index == 0:
            base_x, base_y = landmark_point[0], landmark_point[1]
        temp_landmark_list[index][0] = temp_landmark_list[index][0] - base_x
        temp_landmark_list[index][1] = temp_landmark_list[index][1] - base_y

    # 3. Flatten the array into 1D
    temp_landmark_list = list(itertools.chain.from_iterable(temp_landmark_list))

    # 4. Normalize the data by dividing by the maximum absolute value
    max_value = max(list(map(abs, temp_landmark_list)))
    def normalize_(n):
        return n / max_value if max_value != 0 else 0
    
    return list(map(normalize_, temp_landmark_list))

def main():
    # Load Model and Labels
    model_path = resolve_asset_path("keypoint_classifier.tflite")
    labels_path = resolve_asset_path("keypoint_classifier_label.csv")

    interpreter = Interpreter(model_path=str(model_path))
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()[0]
    output_details = interpreter.get_output_details()[0]
    
    labels = load_labels(labels_path)

    # Setup MediaPipe and Webcam
    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands(min_detection_confidence=0.7, min_tracking_confidence=0.7, max_num_hands=1)
    cap = cv2.VideoCapture(0)

    print("Starting webcam... Press 'q' to quit.")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        frame = cv2.flip(frame, 1) # Mirror the image
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb_frame)

        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                # Draw the skeleton on your hand
                mp.solutions.drawing_utils.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)
                
                # Run the math preprocessing
                processed_landmarks = pre_process_landmark(frame, hand_landmarks)
                
                # Format for the TFLite model and run prediction
                input_data = np.array([processed_landmarks], dtype=np.float32)
                interpreter.set_tensor(input_details['index'], input_data)
                interpreter.invoke()
                
                # Get the result and look up the English letter
                prediction = interpreter.get_tensor(output_details['index'])
                best_guess_index = np.argmax(np.squeeze(prediction))
                confidence = np.squeeze(prediction)[best_guess_index]

                # Only show if confidence is above 80%
                if confidence > 0.80:
                    english_letter = labels[best_guess_index]
                    cv2.putText(frame, f"Letter: {english_letter} ({confidence*100:.1f}%)", 
                                (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 255, 0), 3)

        cv2.imshow('ASL Alphabet Translator', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'): break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == '__main__':
    main()