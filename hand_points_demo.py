'''
Krish Bharadiya
Date: 18/03/2026
This script captures video from the webcam and detects hand landmarks using MediaPipe.
It displays the video with hand landmarks drawn on it. This is puerly for testing/demonstration purposes.
The actual mediapipe integration will be done in the frontend.
'''

import cv2
import numpy as np
import mediapipe as mp
import time

mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles
mp_hands = mp.solutions.hands

def draw_3d_hands_on_image(image, multi_hand_landmarks, size=350, offset=(10, 10)):
        h, w, c = image.shape
        x_offset = w - size - offset[0]
        y_offset = offset[1]
        
        if x_offset < 0 or y_offset < 0:
            return image

        canvas = np.zeros((size, size, 3), dtype=np.uint8)
        # Match the dark background from the image
        canvas[:] = (35, 35, 40)
        
        # Rotating slightly with time for dynamic real-time interaction
        t = time.time()
        theta_y = np.pi / 4 + np.sin(t*0.5) * 0.1
        theta_x = np.pi / 10
        
        Rx = np.array([[1, 0, 0],
                       [0, np.cos(theta_x), -np.sin(theta_x)],
                       [0, np.sin(theta_x), np.cos(theta_x)]])
                       
        Ry = np.array([[np.cos(theta_y), 0, np.sin(theta_y)],
                       [0, 1, 0],
                       [-np.sin(theta_y), 0, np.cos(theta_y)]])

        # Projection helper
        def proj(pts):
            if len(pts) == 0: return np.zeros((0,2))
            return (pts @ Ry @ Rx)[:, :2] * (size * 0.35) + np.array([size/2, size*0.55])

        # 1. Draw Ground/Wall Grid
        grid_lines = []
        y_floor = 0.8
        z_wall = 0.8
        for v in np.linspace(-1, 1, 6):
            # Floor (y=0.8) along X
            grid_lines.append(([-1, y_floor, v], [1, y_floor, v]))
            # Floor (y=0.8) along Z
            grid_lines.append(([v, y_floor, -1], [v, y_floor, 1]))
            
            # Back wall (z=0.8) along X
            grid_lines.append(([-1, v, z_wall], [1, v, z_wall]))
            # Back wall (z=0.8) along Y
            grid_lines.append(([v, -1, z_wall], [v, y_floor, z_wall]))

        grid_pts = []
        for ln in grid_lines:
            grid_pts.extend(ln)
        grid_pts = np.array(grid_pts)
        grid_2d = proj(grid_pts)
        
        for i in range(0, len(grid_2d), 2):
            pt1 = tuple(grid_2d[i].astype(int))
            pt2 = tuple(grid_2d[i+1].astype(int))
            cv2.line(canvas, pt1, pt2, (80, 80, 85), 1, cv2.LINE_AA)

        # Adding grid labels (fake meter markers like strictly shown in the screenshot)
        labels_3d = np.array([[-1, y_floor, 1], [0, y_floor, 1], [1, y_floor, 1]])
        labels_text = ["-0.10m", "0.00m", "0.10m"]
        labels_2d = proj(labels_3d)
        for pt, txt in zip(labels_2d, labels_text):
            label_p = (int(pt[0])-15, int(pt[1])+15)
            cv2.putText(canvas, txt, label_p, cv2.FONT_HERSHEY_SIMPLEX, 0.3, (150, 150, 150), 1, cv2.LINE_AA)

        all_landmarks = []
        # 2. Collect & normalize all hand landmarks together
        for idx, landmarks in enumerate(multi_hand_landmarks):
            hand_pts = []
            for lm in landmarks.landmark:
                # Invert Y here so the hand doesn't render upside down in our local 3d grid!
                hand_pts.append([lm.x, lm.y, lm.z])
            all_landmarks.append(np.array(hand_pts))
            
        if len(all_landmarks) > 0:
            # Find common center to ensure multiple hands are aligned properly on the grid
            stacked = np.vstack(all_landmarks)
            center = stacked.mean(axis=0)
            # Adjust center to feel grounded on our fake floor
            center[1] -= 0.2 
            
            for i, h_pts in enumerate(all_landmarks):
                # Normalize points around our focal center
                h_pts -= center
                
                # Scale appropriately to make the hand large but fit smoothly inside the grid limits
                h_pts *= 3.5
                
                pts_2d = proj(h_pts)
                
                # Draw Connections in grey
                for connection in mp_hands.HAND_CONNECTIONS:
                    s_idx, e_idx = connection
                    pt1 = tuple(pts_2d[s_idx].astype(int))
                    pt2 = tuple(pts_2d[e_idx].astype(int))
                    cv2.line(canvas, pt1, pt2, (120, 120, 120), 2, cv2.LINE_AA)
                
                # Colors: Orange for Hand 1 (BGR: 0, 140, 255), Cyan for Hand 2 (BGR: 255, 200, 0)
                color = (0, 140, 255) if i % 2 == 0 else (255, 200, 0) 
                
                for j, pt in enumerate(pts_2d):
                    p = tuple(pt.astype(int))
                    z = h_pts[j, 2]
                    # Z trick: thinner variation of dots
                    r = max(1, int(3 - z * 2))
                    cv2.circle(canvas, p, r, color, -1, cv2.LINE_AA)

        # 3. Apply canvas exactly like the screenshot
        cv2.rectangle(canvas, (0, 0), (size-1, size-1), (80, 80, 80), 2)
        image[y_offset:y_offset+size, x_offset:x_offset+size] = canvas
        
        return image


# Setup MediaPipe Hands WITHOUT the 'with' context manager to avoid macOS mutex crash
hands = mp_hands.Hands(
    model_complexity=1,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)

# For webcam input:
cap = cv2.VideoCapture(0)

# Create a window to display it full-ish screen
cv2.namedWindow('Advanced MediaPipe Hands', cv2.WINDOW_NORMAL)
cv2.resizeWindow('Advanced MediaPipe Hands', 1280, 720)

while cap.isOpened():
    success, image = cap.read()
    if not success:
        print("Ignoring empty camera frame.")
        continue

    # Flip for selfie-view, convert to RGB for MediaPipe
    image = cv2.flip(image, 1)
    image.flags.writeable = False
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = hands.process(rgb_image)

    # Draw hand landmarks on the image
    image.flags.writeable = True
    
    h, w, c = image.shape
    
    # Draw some overarching HUD elements on the main image
    cv2.putText(image, f"SYS.STATUS: ACTIVE", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2, cv2.LINE_AA)
    cv2.putText(image, f"BIO_TRACKING: HANDS", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2, cv2.LINE_AA)
    
    if results.multi_hand_landmarks:
        for hand_id, hand_landmarks in enumerate(results.multi_hand_landmarks):
            # Advanced main screen annotations
            # Outer glow
            glow_points = mp_drawing.DrawingSpec(color=(255, 100, 0), thickness=4, circle_radius=2)
            glow_lines = mp_drawing.DrawingSpec(color=(255, 0, 100), thickness=3)
            mp_drawing.draw_landmarks(
                image, hand_landmarks, mp_hands.HAND_CONNECTIONS,
                landmark_drawing_spec=glow_points,
                connection_drawing_spec=glow_lines)
            
            # Inner core
            core_points = mp_drawing.DrawingSpec(color=(255, 255, 255), thickness=1, circle_radius=1)
            core_lines = mp_drawing.DrawingSpec(color=(0, 255, 255), thickness=1)
            mp_drawing.draw_landmarks(
                image, hand_landmarks, mp_hands.HAND_CONNECTIONS,
                landmark_drawing_spec=core_points,
                connection_drawing_spec=core_lines)
            
            # Draw bounding box for extra "advanced" feel
            x_min, y_min = w, h
            x_max, y_max = 0, 0
            for lm in hand_landmarks.landmark:
                x, y = int(lm.x * w), int(lm.y * h)
                x_min, y_min = min(x_min, x), min(y_min, y)
                x_max, y_max = max(x_max, x), max(y_max, y)
            
            pad = 20
            cv2.rectangle(image, (x_min-pad, y_min-pad), (x_max+pad, y_max+pad), (0, 255, 255), 1, cv2.LINE_AA)
            cv2.putText(image, f"HAND [{hand_id}] LOCKED", (x_min-pad, y_min-pad-10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
            
        # Draw 3D rep for ALL hands at once in top right, identical to MediaPipe 3D grid
        image = draw_3d_hands_on_image(image, results.multi_hand_landmarks, size=350, offset=(20, 20))

    cv2.imshow('Advanced MediaPipe Hands', image)
    if cv2.waitKey(5) & 0xFF == 27:
        break

cap.release()
hands.close()
cv2.destroyAllWindows()