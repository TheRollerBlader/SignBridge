# Project Signbridge

[cite_start]**Owners:** Krish Bharadiya & Kush Bharadiya [cite: 2, 3, 11]
[cite_start]**Status:** In Progress (Started Mar 18, 2026) [cite: 10]

---

## Project Overview

[cite_start]Right now, there is a massive communication gap between the Deaf community and those who don't know American Sign Language (ASL)[cite: 18]. [cite_start]Project Signbridge solves this by using AI to translate ASL into English text in real-time[cite: 19]. [cite_start]Because it runs through a standard web browser and webcam, it instantly bridges the gap anywhere, anytime, without requiring app downloads or expensive equipment[cite: 20]. 

[cite_start]*(Note: No generative AI was used to produce text in the original document[cite: 8].)*

---

## Scope & Strategy

### In Scope
* [cite_start]Browser-based webcam video capture using WebRTC[cite: 42, 43].
* [cite_start]Real-time hand landmark extraction in the browser via MediaPipe[cite: 44].
* [cite_start]Data normalization (converting pixels to relative coordinates)[cite: 45].
* [cite_start]WebSocket communication between the frontend and backend[cite: 48].
* [cite_start]On-screen text display of translated letters and common words[cite: 49, 50].
* [cite_start]Tracking facial expressions and body posture[cite: 47].

### Out of Scope
* [cite_start]Translating fluent, dynamic ASL sentences[cite: 51, 52].
* [cite_start]Sending raw video frames to the Python server[cite: 53].
* [cite_start]Integrating specialized hardware like depth cameras or sensor gloves[cite: 54].
* [cite_start]Building native iOS or Android mobile apps[cite: 55].

### Execution Phases
1.  [cite_start]**Phase 1:** Utilize the Google MediaPipe hand landmark detection model to extract 21 distinct coordinate points for each hand[cite: 60].
2.  [cite_start]**Phase 2:** Convert raw 3D hand landmarks into normalized, relative coordinates to build a custom training dataset[cite: 65]. [cite_start]A lightweight machine learning model is trained to recognize numerical patterns, and a Python backend applies confidence thresholds to live data streams for real-time translation[cite: 66, 67].
3.  [cite_start]**Phase 3:** Render the recognized letters/words onto the UI for visual feedback[cite: 68]. [cite_start]A Gemini agent anticipates the user's intended next words, and the Gemini model synthesizes the text into spoken output[cite: 69, 70].

---

## Target Audience

* [cite_start]**ASL Students and Self-Learners:** Tech-savvy individuals actively studying sign language who need interactive web tools for real-time visual feedback to practice at home[cite: 79, 81, 82, 83, 84].
* [cite_start]**Public-Facing Professionals:** Retail workers and service staff who interact with the public but lack formal ASL training, needing fast, zero-installation tools to bridge communication gaps[cite: 85, 86, 87, 88].
* [cite_start]**The Deaf Community:** Native ASL signers who need frictionless, browser-based tools to share their thoughts without forcing others to download dedicated apps[cite: 89, 90, 91].

---

## Tracking & Milestones

**Key Milestones:**
* [cite_start]**March 18, 2026 (Webcam on Browser):** Successfully accessed the webcam via the browser and used Google MediaPipe to annotate 21 points on each hand[cite: 94, 95, 96, 101].
* [cite_start]**March 19, 2026 (Train Neural Network):** Trained a Neural Network using an ASL fingerspelling dataset to predict alphabetical characters from given signs[cite: 97, 98, 99, 100, 102].

**Task Progress:**
| Objective | Sub-Tasks | % Complete |
| :--- | :--- | :--- |
| [cite_start]**MediaPipe in Web Browser** [cite: 136] | [cite_start]Native WebRTC API access / Feeding stream to MediaPipe [cite: 136] | [cite_start]100% [cite: 136] |
| [cite_start]**Train Neural Network** [cite: 137] | [cite_start]Gather Google Fingerspelling dataset & train with PyTorch [cite: 137] | [cite_start]100% [cite: 137] |
| [cite_start]**Train Neural Network** [cite: 137] | [cite_start]Run MediaPipe on WLASL dataset to train model [cite: 137] | [cite_start]75% [cite: 137] |
| [cite_start]**Landing Page** [cite: 151, 154] | [cite_start]Develop design/layout and ensure functional UI/UX navigation [cite: 152, 155] | [cite_start]25% [cite: 153, 156] |

---

## About the Team & Principles

* [cite_start]**Krish Bharadiya:** AI Team Lead for the Prosper Engineering robotics team[cite: 113, 114]. [cite_start]Proficient in Python, Java, machine learning, and AI API integration[cite: 114, 115]. [cite_start]Previously developed an award-winning AI software for asteroid detection[cite: 116].
* [cite_start]**Kush Bharadiya:** Possesses expertise in Python, JavaScript, and machine learning[cite: 117, 118]. [cite_start]Has worked on an application for yield savings and a science fair initiative using AI for disease detection[cite: 118].
* [cite_start]**Guiding Principles:** * *Zero-Friction Accessibility:* The app must work instantly on standard devices[cite: 121, 122].
    * [cite_start]*Speed Over Complexity:* Collaborative generation of creative solutions[cite: 123, 124].
    * [cite_start]*Privacy by Design:* No actual video frames are saved or sent; only mathematical hand coordinates are transmitted[cite: 125, 126].
    * [cite_start]*Accuracy Over Scale:* Prioritizing 98% accuracy on 26 static letters over 50% accuracy on 100 dynamic words[cite: 127, 128].

---

