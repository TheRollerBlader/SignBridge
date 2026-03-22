# 🤟 SignBridge

> **Real-time American Sign Language (ASL) to English translation — no apps, no hardware, just a browser and a webcam.**

[![Status](https://img.shields.io/badge/Status-In%20Progress-yellow)](https://github.com/)
[![Hackathon](https://img.shields.io/badge/Hackathon-Mar%2018--22%202026-blue)](https://github.com/)
[![Domain](https://img.shields.io/badge/Domain-Accessibility-green)](https://github.com/)

---

## 🌉 The Problem

There is a massive communication gap between the **430+ million Deaf and hard-of-hearing individuals** worldwide and the 99%+ of the population who don't know American Sign Language. Existing tools require expensive specialized hardware, app downloads, or are limited to tiny pre-defined vocabularies.

SignBridge eliminates that friction entirely.

---

## 💡 What is SignBridge?

SignBridge is a **browser-based, real-time ASL interpretation system** that uses your standard webcam — no downloads, no sensor gloves, no accounts. It translates ASL hand gestures into English text (and spoken audio) using a combination of computer vision, deep learning, and a Gemini AI agent.

---

## ⚙️ How It Works

The system runs in three phases:

### Phase 1 — Hand Landmark Detection
Using the browser's native **WebRTC API** and **Google MediaPipe**, the system captures your webcam feed and extracts **21 precise 3D hand landmarks** per hand in real time — entirely client-side, without ever sending raw video to a server.

### Phase 2 — ML Model Inference
Raw landmarks are normalized into relative coordinates and streamed via **WebSocket** to a Python backend. A trained **Neural Network** (for static ASL letters) or **LSTM** (for dynamic words) classifies the gesture with a confidence threshold, returning an English prediction in ~300ms.

- Static letters: trained on **Google's Isolated Sign Language Recognition** dataset
- Dynamic words: trained on the **WLASL (World Level American Sign Language)** dataset

### Phase 3 — Post-Processing & AI Agent
A **Gemini agent** takes the raw, fragmented sign output (e.g., *"Store I go now"*) and:
- Reconstructs it into grammatically correct, natural English
- Predicts the user's intended next words
- Optionally synthesizes the on-screen text into **natural-sounding spoken audio**

---

## 🏗️ Architecture

```
Browser (Client)
├── WebRTC Webcam Capture
├── Google MediaPipe (21 landmarks/hand)
└── WebSocket → Python Backend
        ├── Neural Network (Static Letters)
        ├── LSTM (Dynamic Words)
        └── Gemini Agent (Sentence Reconstruction + TTS)
```

**Privacy by design:** Only mathematical hand coordinates are ever transmitted — no raw video frames leave your device.

---

## ✅ Scope

| In Scope | Out of Scope |
|---|---|
| Browser-based webcam capture (WebRTC) | Fluent dynamic ASL sentence models |
| Real-time MediaPipe landmark extraction | Raw video frame transmission to backend |
| Data normalization (pixels → relative coords) | Depth cameras or sensor gloves |
| WebSocket frontend ↔ backend communication | Native iOS / Android apps |
| On-screen text display of letters & words | |
| Gemini-powered sentence reconstruction | |

---

## 📊 Progress

### Backend

| Objective | Task | Status |
|---|---|---|
| MediaPipe in Browser | WebRTC webcam access | ✅ 100% |
| | MediaPipe landmark integration | ✅ 100% |
| Neural Network | Train fingerspelling model (PyTorch) | ✅ 100% |
| | Train WLASL word model via MediaPipe | ✅ 100% |
| Backend ↔ Frontend | Webcam + MediaPipe integration | ✅ 100% |
| | Model & recognition integration | ✅ 100% |
| Experimental | WLASL word recognition in backend | 🔄 25% |

### Frontend

| Objective | Task | Status |
|---|---|---|
| Full Frontend App | UI/UX design & layout | ✅ 100% |
| | Content integration | ✅ 100% |
| Backend Integration | Webcam functionality | ✅ 100% |
| | Model & recognition | ✅ 100% |

---

## 🎯 Target Audience

- **ASL Students & Self-Learners** — practice fingerspelling with real-time visual feedback
- **Public-Facing Professionals** — instantly bridge communication gaps with Deaf patrons, no installation required
- **The Deaf Community** — share thoughts in environments where sign language isn't understood, without forcing others to download an app

---

## ⚡ Performance

| Metric | Value |
|---|---|
| Median end-to-end latency | ~300ms |
| Target latency | <200ms |
| Alphabet accuracy (goal) | ≥99% on 26 static letters |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Hand Tracking | [Google MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) |
| ML Framework | PyTorch / TensorFlow Lite |
| Static Letter Model | Neural Network (fingerspelling dataset) |
| Dynamic Word Model | LSTM (WLASL dataset) |
| AI Agent | Gemini API |
| Communication | WebSockets |
| Browser API | WebRTC |

---

## 📚 Datasets & References

| Source | Type | Creator |
|---|---|---|
| [Isolated Sign Language Recognition](https://www.kaggle.com/competitions/asl-signs) | Dataset | Google |
| [WLASL — World Level American Sign Language](https://www.kaggle.com/datasets/risangbaskoro/wlasl-processed) | Dataset | Hongdong Li & Dongxu Li |
| [MediaPipe](https://ai.google.dev/edge/mediapipe) | Framework | Google |
| PyTorch | ML Framework | Meta / PyTorch |
| TensorFlow Lite | ML Framework | Google |

---

## 👥 Team

| | |
|---|---|
| **Kush Bharadiya** | Python & JavaScript developer with experience in ML, multi-agent AI systems, and full-stack development. |
| **Krish Bharadiya** | AI Team Lead (Prosper Engineering Robotics), skilled in Python, Java, ML, and AI API integration. Previously built award-winning (DRSEF) asteroid detection AI. |

---

## 🧭 Guiding Principles

- **Zero-Friction Accessibility** — Works instantly on standard devices; no hardware, no accounts, no downloads
- **Privacy by Design** — Only hand coordinates are transmitted; no video frames ever leave the browser
- **Accuracy Over Scale** — 99% accuracy on 26 letters beats 50% accuracy on 100 dynamic words
- **Speed Over Complexity** — Ship a focused, working system before expanding scope

---

## 📅 Milestones

| Milestone | Date | Outcome |
|---|---|---|
| Webcam on Browser | Mar 18, 2026 | WebRTC access + MediaPipe 21-point annotation working |
| Train Neural Network | Mar 19, 2026 | ASL fingerspelling model trained on Google dataset |
| Complete Application | Mar 22, 2026 | Full integration shipped for hackathon submission |

---

*Built at a hackathon · Mar 18–22, 2026 · Prosper, TX*
