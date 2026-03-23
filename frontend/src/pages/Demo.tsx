import { useEffect, useRef, useState, useCallback } from 'react';
import { startLiveCaptionSession, type LiveCaptionHandle } from '../lib/liveCaption';

/** Dev: proxied by Vite to 127.0.0.1:8000. Prod: set VITE_API_BASE_URL (no trailing slash). */
const apiBase =
  import.meta.env.VITE_API_BASE_URL != null && String(import.meta.env.VITE_API_BASE_URL).trim() !== ''
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '')
    : '';

const predictUrl = apiBase ? `${apiBase}/predict` : '/api/predict';
const narrateUrl = apiBase ? `${apiBase}/gemini/narrate` : '/api/gemini/narrate';
const predictWlaslUrl = apiBase ? `${apiBase}/predict/wlasl` : '/api/predict/wlasl';

/** Same layout as Training/mediapipe_extraction.py hands_pose: pose 33×4 + L hand 21×3 + R hand 21×3 = 258 */
function buildHandsPose258(
  pose: { x: number; y: number; z: number; visibility?: number }[] | undefined,
  handResults: { landmarks?: unknown[]; handednesses?: { categoryName?: string; displayName?: string }[][] }
): Float32Array {
  const out = new Float32Array(258);
  if (pose && pose.length >= 33) {
    for (let i = 0; i < 33; i++) {
      const l = pose[i];
      out[i * 4] = l.x;
      out[i * 4 + 1] = l.y;
      out[i * 4 + 2] = l.z;
      out[i * 4 + 3] = l.visibility ?? 0;
    }
  }
  const lh = new Float32Array(63);
  const rh = new Float32Array(63);
  const lm = handResults.landmarks as { x: number; y: number; z: number }[][] | undefined;
  const hs = handResults.handednesses;
  if (lm) {
    for (let h = 0; h < lm.length; h++) {
      const handLm = lm[h];
      let isLeft = false;
      if (hs && hs[h]?.[0]) {
        const name = (hs[h][0].categoryName ?? hs[h][0].displayName ?? '').toLowerCase();
        isLeft = name.includes('left');
      } else {
        isLeft = h === 0;
      }
      const target = isLeft ? lh : rh;
      for (let i = 0; i < 21; i++) {
        const l = handLm[i];
        target[i * 3] = l.x;
        target[i * 3 + 1] = l.y;
        target[i * 3 + 2] = l.z;
      }
    }
  }
  out.set(lh, 132);
  out.set(rh, 132 + 63);
  return out;
}

const API_KEY_STORAGE_KEY = 'signbridge_gemini_api_key';

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian',
  'Chinese', 'Japanese', 'Korean', 'Arabic', 'Hindi', 'Russian',
  'Dutch', 'Turkish', 'Polish', 'Vietnamese', 'Thai', 'Indonesian',
] as const;

const Demo = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [status, setStatus] = useState({ text: 'Model Initializing', classes: 'bg-emerald-50 text-emerald-600 border-emerald-100' });
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE_KEY) ?? '');
  const [showKey, setShowKey] = useState(false);
  const geminiKeyRef = useRef(geminiKey);
  const [deafLang, setDeafLang] = useState(() => localStorage.getItem('signbridge_deaf_lang') ?? 'English');
  const [hearingLang, setHearingLang] = useState(() => localStorage.getItem('signbridge_hearing_lang') ?? 'English');
  const deafLangRef = useRef(deafLang);
  const hearingLangRef = useRef(hearingLang);

  const [predictedVector, setPredictedVector] = useState<string>('-');
  const [predictionConfidence, setPredictionConfidence] = useState<number | null>(null);
  const [translationSequence, setTranslationSequence] = useState<string>('');
  const [hearingTranscript, setHearingTranscript] = useState<string>('');
  const [apiOffline, setApiOffline] = useState(false);
  /** 0 = voice off; 1–100 = Web Speech volume (Gemini phrase from backend). */
  const [speakLevel, setSpeakLevel] = useState(0);
  const [narrateSource, setNarrateSource] = useState<'idle' | 'gemini' | 'fallback'>('idle');
  const [experimentalWlasl, setExperimentalWlasl] = useState(false);
  const [wlaslPoseReady, setWlaslPoseReady] = useState(false);
  const [wlaslWord, setWlaslWord] = useState<string | null>(null);
  const [wlaslConfidence, setWlaslConfidence] = useState<number | null>(null);
  const [wlaslError, setWlaslError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const handLandmarkerRef = useRef<any>(null);
  const drawingUtilsRef = useRef<any>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastPredictionRef = useRef<string | null>(null);
  const consecutivePredictionsRef = useRef<number>(0);
  const lastFetchTimeRef = useRef<number>(0);
  const lastHandPresenceTimeRef = useRef<number | null>(null);
  const lastPredictErrorLogRef = useRef(0);
  /** When true, widen time between /predict calls so DevTools are not flooded with 502s. */
  const apiOfflineRef = useRef(false);
  const narrateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** `translationSequence.trimEnd()` after we last spoke a completed word. */
  const lastSpokenTrimmedRef = useRef<string | null>(null);
  const speakLevelRef = useRef(0);
  const narrateAudioRef = useRef<HTMLAudioElement | null>(null);
  const poseLandmarkerRef = useRef<any>(null);
  const experimentalWlaslRef = useRef(false);
  const wlaslFrameBufferRef = useRef<number[][]>([]);
  const lastWlaslFetchRef = useRef(0);
  const lastWlaslHandTimeRef = useRef(0);
  /** Last change to translation sequence: signing vs partner speech (TTS skips speech-sourced chunks). */
  const lastSeqMutationRef = useRef<'sign' | 'speech' | null>(null);
  const narrateBackoffUntilRef = useRef(0);
  const liveCaptionRef = useRef<LiveCaptionHandle | null>(null);

  const [hasMicTrack, setHasMicTrack] = useState(false);
  const [liveCaptionActive, setLiveCaptionActive] = useState(false);
  const [liveSpeechDraft, setLiveSpeechDraft] = useState('');
  const [captionApiHint, setCaptionApiHint] = useState<string | null>(null);

  useEffect(() => {
    geminiKeyRef.current = geminiKey;
    if (geminiKey) localStorage.setItem(API_KEY_STORAGE_KEY, geminiKey);
    else localStorage.removeItem(API_KEY_STORAGE_KEY);
  }, [geminiKey]);

  useEffect(() => {
    deafLangRef.current = deafLang;
    localStorage.setItem('signbridge_deaf_lang', deafLang);
  }, [deafLang]);

  useEffect(() => {
    hearingLangRef.current = hearingLang;
    localStorage.setItem('signbridge_hearing_lang', hearingLang);
  }, [hearingLang]);

  useEffect(() => {
    speakLevelRef.current = speakLevel;
  }, [speakLevel]);

  useEffect(() => {
    experimentalWlaslRef.current = experimentalWlasl;
    if (!experimentalWlasl) {
      wlaslFrameBufferRef.current = [];
      setWlaslWord(null);
      setWlaslConfidence(null);
      setWlaslError(null);
    } else {
      setPredictedVector('-');
      setPredictionConfidence(null);
      lastPredictionRef.current = null;
      consecutivePredictionsRef.current = 0;
    }
  }, [experimentalWlasl]);

  useEffect(() => {
    if (!experimentalWlasl) return;
    let cancelled = false;

    const loadPose = async () => {
      setWlaslPoseReady(false);
      try {
        const { PoseLandmarker, FilesetResolver } = await import(
          // @ts-ignore CDN ESM (same bundle as HandLandmarker)
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs'
        );
        const filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        );
        const pose = await PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        if (!cancelled) {
          poseLandmarkerRef.current = pose;
          setWlaslPoseReady(true);
        }
      } catch (e: any) {
        if (!cancelled) {
          setWlaslError(e?.message ?? 'Pose model failed to load');
          setWlaslPoseReady(false);
        }
      }
    };

    loadPose();
    return () => {
      cancelled = true;
    };
  }, [experimentalWlasl]);

  useEffect(() => {
    if (speakLevel === 0) {
      speechSynthesis.cancel();
      if (narrateAudioRef.current) {
        narrateAudioRef.current.pause();
        narrateAudioRef.current.src = '';
        narrateAudioRef.current = null;
      }
      if (narrateTimeoutRef.current) {
        clearTimeout(narrateTimeoutRef.current);
        narrateTimeoutRef.current = null;
      }
      lastSpokenTrimmedRef.current = null;
      setNarrateSource('idle');
      return;
    }

    if (experimentalWlasl) {
      speechSynthesis.cancel();
      if (narrateAudioRef.current) {
        narrateAudioRef.current.pause();
        narrateAudioRef.current.src = '';
        narrateAudioRef.current = null;
      }
      if (narrateTimeoutRef.current) {
        clearTimeout(narrateTimeoutRef.current);
        narrateTimeoutRef.current = null;
      }
      return;
    }

    const seq = translationSequence;
    if (narrateTimeoutRef.current) {
      clearTimeout(narrateTimeoutRef.current);
      narrateTimeoutRef.current = null;
    }

    if (!seq.trim()) {
      lastSpokenTrimmedRef.current = null;
      return;
    }

    // Only after a space: speak the last completed word (not letter-by-letter while spelling).
    if (!/\s$/.test(seq)) {
      return;
    }

    const trimmed = seq.trimEnd();
    if (trimmed === lastSpokenTrimmedRef.current) {
      return;
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);
    const word = parts[parts.length - 1];
    if (!word) {
      return;
    }

    if (lastSeqMutationRef.current === 'speech') {
      lastSeqMutationRef.current = null;
      lastSpokenTrimmedRef.current = trimmed;
      return;
    }

    narrateTimeoutRef.current = setTimeout(() => {
      narrateTimeoutRef.current = null;
      if (speakLevelRef.current === 0) return;
      if (Date.now() < narrateBackoffUntilRef.current) {
        lastSpokenTrimmedRef.current = trimmed;
        return;
      }

      const hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
      if (geminiKeyRef.current) hdrs['X-Gemini-Api-Key'] = geminiKeyRef.current;
      fetch(narrateUrl, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ sequence: word, target_lang: hearingLangRef.current }),
      })
        .then(async (res) => {
          if (res.status === 429) {
            narrateBackoffUntilRef.current = Date.now() + 120_000;
            const err = await res.text();
            throw new Error(err || '429');
          }
          if (!res.ok) {
            const err = await res.text();
            throw new Error(err || `HTTP ${res.status}`);
          }
          return res.json() as Promise<{
          phrase?: string;
          source?: string;
          audio_base64?: string | null;
          audio_mime_type?: string;
        }>;
        })
        .then((data) => {
          const phrase = (data.phrase ?? '').trim();
          if (!phrase && !data.audio_base64) return;

          lastSpokenTrimmedRef.current = trimmed;
          setNarrateSource(data.source === 'gemini' ? 'gemini' : 'fallback');

          speechSynthesis.cancel();
          if (narrateAudioRef.current) {
            narrateAudioRef.current.pause();
            narrateAudioRef.current.src = '';
            narrateAudioRef.current = null;
          }

          const vol = Math.max(0, Math.min(1, speakLevelRef.current / 100));

          liveCaptionRef.current?.mute();

          if (data.audio_base64) {
            const mime = data.audio_mime_type ?? 'audio/wav';
            const audio = new Audio(`data:${mime};base64,${data.audio_base64}`);
            audio.volume = vol;
            narrateAudioRef.current = audio;
            audio.onended = () => liveCaptionRef.current?.unmute();
            audio.onerror = () => liveCaptionRef.current?.unmute();
            audio.play().catch(() => {
              if (phrase) {
                const u = new SpeechSynthesisUtterance(phrase);
                u.volume = vol;
                u.rate = 0.92;
                u.onend = () => liveCaptionRef.current?.unmute();
                u.onerror = () => liveCaptionRef.current?.unmute();
                speechSynthesis.speak(u);
              } else {
                liveCaptionRef.current?.unmute();
              }
            });
          } else if (phrase) {
            const u = new SpeechSynthesisUtterance(phrase);
            u.volume = vol;
            u.rate = 0.92;
            u.onend = () => liveCaptionRef.current?.unmute();
            u.onerror = () => liveCaptionRef.current?.unmute();
            speechSynthesis.speak(u);
          } else {
            liveCaptionRef.current?.unmute();
          }
        })
        .catch(() => {
          const fallback = word.toLowerCase();
          if (!fallback) {
            liveCaptionRef.current?.unmute();
            return;
          }
          lastSpokenTrimmedRef.current = trimmed;
          setNarrateSource('fallback');
          speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(fallback);
          u.volume = Math.max(0, Math.min(1, speakLevelRef.current / 100));
          u.rate = 0.92;
          u.onend = () => liveCaptionRef.current?.unmute();
          u.onerror = () => liveCaptionRef.current?.unmute();
          speechSynthesis.speak(u);
        });
    }, 720);

    return () => {
      if (narrateTimeoutRef.current) {
        clearTimeout(narrateTimeoutRef.current);
        narrateTimeoutRef.current = null;
      }
    };
  }, [translationSequence, speakLevel, experimentalWlasl]);

  useEffect(() => {
    if (!isCameraActive || experimentalWlasl) {
      liveCaptionRef.current?.dispose();
      liveCaptionRef.current = null;
      setLiveCaptionActive(false);
      setLiveSpeechDraft('');
      return;
    }

    const stream = streamRef.current;
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const audioStream = new MediaStream(audioTracks);
    let cancelled = false;

    const isTranslating = deafLangRef.current !== hearingLangRef.current;

    const commitSpeech = (line: string) => {
      if (!line) return;
      lastSeqMutationRef.current = 'speech';
      setHearingTranscript((prev) => {
        const needsSpace = prev.length > 0 && !/\s$/.test(prev);
        return prev + (needsSpace ? ' ' : '') + line + ' ';
      });
    };

    void startLiveCaptionSession(audioStream, {
      onConnection: (open) => {
        setLiveCaptionActive(open);
        if (open) setCaptionApiHint(null);
      },
      onError: (msg) => setCaptionApiHint(msg.slice(0, 500)),
      onTranscript: (text, finished) => {
        if (finished) {
          setLiveSpeechDraft('');
          if (!isTranslating) commitSpeech(text.trim());
        } else {
          if (text) setLiveSpeechDraft(text);
        }
      },
      onTranslation: (text) => {
        setLiveSpeechDraft('');
        commitSpeech(text.trim());
      },
    }, {
      apiKey: geminiKeyRef.current || undefined,
      deafLang: deafLangRef.current,
      hearingLang: hearingLangRef.current,
    })
      .then((handle) => {
        if (!cancelled) liveCaptionRef.current = handle;
      })
      .catch((e: unknown) => {
        setCaptionApiHint(e instanceof Error ? e.message.slice(0, 500) : 'Live captions failed to start');
        setLiveCaptionActive(false);
      });

    return () => {
      cancelled = true;
      liveCaptionRef.current?.dispose();
      liveCaptionRef.current = null;
      setLiveCaptionActive(false);
      setLiveSpeechDraft('');
    };
  }, [isCameraActive, experimentalWlasl]);

  // Initialize MediaPipe model once
  useEffect(() => {
    let isCancelled = false;

    const initModel = async () => {
      try {
        setStatus({ text: 'Loading Model...', classes: 'bg-yellow-50 text-yellow-600 border-yellow-100' });
        
        // @ts-ignore
        const { HandLandmarker, FilesetResolver, DrawingUtils } = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs");

        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
        );

        const landmarker = await HandLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (isCancelled) return;
        
        handLandmarkerRef.current = landmarker;

        const canvasCtx = canvasRef.current?.getContext("2d");
        if (canvasCtx) {
          drawingUtilsRef.current = new DrawingUtils(canvasCtx);
        }

        setIsModelReady(true);
        setStatus({ text: 'Model Ready (Camera Off)', classes: 'bg-blue-50 text-blue-600 border-blue-100' });
      } catch (err: any) {
        if (!isCancelled) {
          setStatus({ text: `Error: ${err.message}`, classes: 'bg-red-100 text-red-700 border-red-200' });
          console.error(err);
        }
      }
    };

    initModel();

    return () => {
      isCancelled = true;
    };
  }, []);

  const detect = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !handLandmarkerRef.current) return;

    const now = performance.now();
    if (videoRef.current.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = videoRef.current.currentTime;
      const results = handLandmarkerRef.current.detectForVideo(videoRef.current, now);

      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

          if (results.landmarks && results.landmarks.length > 0) {
            lastHandPresenceTimeRef.current = now;
            
            for (const landmarks of results.landmarks) {
                drawingUtilsRef.current?.drawConnectors(landmarks, [
                    {start: 0, end: 1}, {start: 1, end: 2}, {start: 2, end: 3}, {start: 3, end: 4}, // Thumb
                    {start: 0, end: 5}, {start: 5, end: 6}, {start: 6, end: 7}, {start: 7, end: 8}, // Index
                    {start: 5, end: 9}, {start: 9, end: 10}, {start: 10, end: 11}, {start: 11, end: 12}, // Middle
                    {start: 9, end: 13}, {start: 13, end: 14}, {start: 14, end: 15}, {start: 15, end: 16}, // Ring
                    {start: 13, end: 17}, {start: 0, end: 17}, {start: 17, end: 18}, {start: 18, end: 19}, {start: 19, end: 20} // Pinky
                ], {
                    color: "#2ecc71",
                    lineWidth: 4,
                });
                drawingUtilsRef.current?.drawLandmarks(landmarks, {
                    color: "#ffffff",
                    lineWidth: 2,
                    radius: 5,
                });
            }

            if (experimentalWlaslRef.current) {
              if (poseLandmarkerRef.current && videoRef.current) {
                const pr = poseLandmarkerRef.current.detectForVideo(videoRef.current, now);
                const poseLm = pr.landmarks?.[0] as
                  | { x: number; y: number; z: number; visibility?: number }[]
                  | undefined;
                lastWlaslHandTimeRef.current = now;
                const feat = buildHandsPose258(poseLm, results);
                const buf = wlaslFrameBufferRef.current;
                buf.push(Array.from(feat));
                if (buf.length > 50) buf.shift();
                if (now - lastWlaslFetchRef.current > 300 && buf.length > 0) {
                  lastWlaslFetchRef.current = now;
                  fetch(predictWlaslUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ frames: buf, max_frames: 50 }),
                  })
                    .then(async (res) => {
                      if (!res.ok) {
                        const text = await res.text();
                        throw new Error(text || `HTTP ${res.status}`);
                      }
                      return res.json() as Promise<{ word?: string; confidence?: number }>;
                    })
                    .then((data) => {
                      setWlaslError(null);
                      setWlaslWord(data.word ?? null);
                      setWlaslConfidence(
                        typeof data.confidence === 'number' ? data.confidence : null
                      );
                    })
                    .catch((err: unknown) => {
                      setWlaslWord(null);
                      setWlaslConfidence(null);
                      setWlaslError(err instanceof Error ? err.message : 'WLASL request failed');
                    });
                }
              }
            } else {
              const minPredictGapMs = apiOfflineRef.current ? 2500 : 120;
              if (now - lastFetchTimeRef.current > minPredictGapMs) {
                const landmarks = results.landmarks[0];
                const vw = videoRef.current.videoWidth;
                const vh = videoRef.current.videoHeight;
                if (vw >= 2 && vh >= 2) {
                    lastFetchTimeRef.current = now;
                    fetch(predictUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            landmarks: landmarks,
                            width: vw,
                            height: vh
                        })
                    })
                    .then(async (res) => {
                        if (!res.ok) {
                            const text = await res.text();
                            throw new Error(text || `HTTP ${res.status}`);
                        }
                        return res.json() as Promise<{ letter?: string | null; confidence?: number }>;
                    })
                    .then((data) => {
                        apiOfflineRef.current = false;
                        setApiOffline(false);
                        if (data.letter != null && data.letter !== '') {
                            setPredictedVector(data.letter);
                            setPredictionConfidence(
                                typeof data.confidence === 'number' ? data.confidence : null
                            );

                            if (data.letter === lastPredictionRef.current) {
                                consecutivePredictionsRef.current += 1;
                                if (consecutivePredictionsRef.current === 10) {
                                    lastSeqMutationRef.current = 'sign';
                                    setTranslationSequence((prev) => prev + data.letter);
                                    consecutivePredictionsRef.current = -20;
                                }
                            } else {
                                lastPredictionRef.current = data.letter;
                                consecutivePredictionsRef.current = 1;
                            }
                        } else {
                            setPredictedVector('-');
                            setPredictionConfidence(null);
                            lastPredictionRef.current = null;
                            consecutivePredictionsRef.current = 0;
                        }
                    })
                    .catch((err) => {
                        apiOfflineRef.current = true;
                        setApiOffline(true);
                        const t = Date.now();
                        if (t - lastPredictErrorLogRef.current > 12000) {
                            lastPredictErrorLogRef.current = t;
                            console.warn(
                                'Classifier API unreachable (502 = Vite proxy could not connect to 127.0.0.1:8000). Install deps: pip install -r backend/requirements.txt then run: npm run dev:api (or npm run dev:all from frontend/).',
                                err
                            );
                        }
                    });
                }
              }
            }
          } else {
            if (!experimentalWlaslRef.current) {
                if (lastHandPresenceTimeRef.current) {
                    if (now - lastHandPresenceTimeRef.current > 500) {
                        lastSeqMutationRef.current = 'sign';
                        setTranslationSequence((prev) => {
                            if (prev.endsWith(' ')) return prev;
                            return prev + ' ';
                        });
                        setPredictedVector('-');
                        setPredictionConfidence(null);
                        lastPredictionRef.current = null;
                        consecutivePredictionsRef.current = 0;
                        lastHandPresenceTimeRef.current = null;
                    }
                } else {
                    setPredictedVector('-');
                    setPredictionConfidence(null);
                    lastPredictionRef.current = null;
                    consecutivePredictionsRef.current = 0;
                }
            } else if (
              wlaslFrameBufferRef.current.length > 0 &&
              now - lastWlaslHandTimeRef.current > 500
            ) {
              wlaslFrameBufferRef.current = [];
            }
          }
      }
    }

    if (isCameraActiveRef.current) {
      animationFrameIdRef.current = requestAnimationFrame(detect);
    }
  }, []);

  // Use a ref for the detect loop to always know the latest isCameraActive without recreating detect
  const isCameraActiveRef = useRef(isCameraActive);
  useEffect(() => {
    isCameraActiveRef.current = isCameraActive;
  }, [isCameraActive]);

  const setCameraActive = (active: boolean) => {
    isCameraActiveRef.current = active;
    setIsCameraActive(active);
  };

  const startCamera = async () => {
    if (!isModelReady) return;

    try {
      setStatus({ text: 'Requesting Camera...', classes: 'bg-yellow-100 text-yellow-700 border-yellow-200' });

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        setHasMicTrack(stream.getAudioTracks().length > 0);
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
        });
        setHasMicTrack(false);
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
          if (canvasRef.current && videoRef.current) {
              canvasRef.current.width  = videoRef.current.videoWidth;
              canvasRef.current.height = videoRef.current.videoHeight;
          }
          setCameraActive(true);
          setStatus({ text: 'Tracking Active', classes: 'bg-green-100 text-green-700 border-green-200' });
          
          // Start detection loop
          if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
          detect();
        };
      }
    } catch (err: any) {
      setStatus({ text: `Camera Error: ${err.message}`, classes: 'bg-red-100 text-red-700 border-red-200' });
    }
  };

  const stopCamera = () => {
    if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setHasMicTrack(false);
    setStatus({ text: 'Camera Stopped', classes: 'bg-gray-100 text-gray-700 border-gray-200' });
    
    // Clear canvas
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <main className="flex-grow flex flex-col items-center px-6 pt-10 pb-20 w-full max-w-7xl mx-auto animate-spring-up">
        <div className="text-center mb-16 w-full max-w-3xl">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-600 font-semibold mb-4">Live Browser Inference</div>
            <h1 className="text-5xl md:text-6xl font-light tracking-wide mb-6 font-['Inter']">Real-Time Translation</h1>
            <p className="text-xl text-black/60 font-light leading-relaxed mb-8">
                One shared conversation log: your signs appear as letters, and speech picked up by the mic is transcribed into the same line so both people can follow the thread.
            </p>
            <div className="flex flex-col items-center gap-4 mt-6">
                <div className="w-full max-w-md flex items-center gap-2 rounded-full border border-black/10 bg-white/60 backdrop-blur-sm px-4 py-2 shadow-sm">
                    <svg className="w-4 h-4 text-black/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                    <input
                        type={showKey ? 'text' : 'password'}
                        value={geminiKey}
                        onChange={(e) => setGeminiKey(e.target.value)}
                        placeholder="Gemini API key"
                        spellCheck={false}
                        className="flex-1 bg-transparent text-sm text-black/80 placeholder:text-black/30 outline-none font-mono tracking-tight"
                    />
                    <button type="button" onClick={() => setShowKey((v) => !v)} className="text-[0.6rem] uppercase tracking-widest text-black/40 hover:text-black/70 font-semibold">
                        {showKey ? 'Hide' : 'Show'}
                    </button>
                </div>
                {!geminiKey && (
                    <p className="text-xs text-amber-700/80">Enter your <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline hover:text-amber-900">Gemini API key</a> to enable live captions and TTS.</p>
                )}
                <div className="flex flex-wrap justify-center gap-3">
                    <label className="flex items-center gap-2 rounded-full border border-black/10 bg-white/60 backdrop-blur-sm px-4 py-2 shadow-sm text-sm">
                        <span className="text-[0.6rem] uppercase tracking-widest text-black/45 font-semibold whitespace-nowrap">Deaf person</span>
                        <select value={deafLang} onChange={(e) => setDeafLang(e.target.value)} className="bg-transparent text-black/80 outline-none cursor-pointer text-sm">
                            {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </label>
                    <label className="flex items-center gap-2 rounded-full border border-black/10 bg-white/60 backdrop-blur-sm px-4 py-2 shadow-sm text-sm">
                        <span className="text-[0.6rem] uppercase tracking-widest text-black/45 font-semibold whitespace-nowrap">Hearing person</span>
                        <select value={hearingLang} onChange={(e) => setHearingLang(e.target.value)} className="bg-transparent text-black/80 outline-none cursor-pointer text-sm">
                            {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </label>
                </div>
                <div className="flex justify-center">
                    {!isCameraActive ? (
                        <button onClick={startCamera} disabled={!isModelReady} className={`px-8 py-3 rounded-full font-bold text-sm tracking-widest uppercase shadow-lg transition-all duration-300 ${isModelReady ? 'bg-emerald-500 hover:bg-emerald-600 text-white hover:-translate-y-1' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                            {isModelReady ? 'Start Camera' : 'Loading Model...'}
                        </button>
                    ) : (
                        <button onClick={stopCamera} className="px-8 py-3 rounded-full font-bold text-sm tracking-widest uppercase shadow-lg transition-all duration-300 bg-red-500 hover:bg-red-600 text-white hover:-translate-y-1">
                            Stop Camera
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setExperimentalWlasl((v) => !v)}
                    disabled={!isModelReady}
                    className={`px-5 py-2.5 rounded-full text-xs font-semibold tracking-wide border transition-all ${
                        experimentalWlasl
                            ? 'bg-indigo-600 border-indigo-700 text-white shadow-md'
                            : 'bg-white/80 border-indigo-200 text-indigo-800 hover:bg-indigo-50'
                    } ${!isModelReady ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                    {experimentalWlasl ? 'Experimental WLASL: on' : 'Experimental: word translation (WLASL)'}
                </button>
                {experimentalWlasl && !wlaslPoseReady && (
                    <p className="text-xs text-indigo-600/90">Loading pose model for WLASL features…</p>
                )}
            </div>
        </div>
        
        <div className="w-full flex flex-col gap-8">
        <div className="w-full flex flex-col lg:flex-row gap-8 items-stretch">
            {/* Camera / Video Feed */}
            <div className="w-full lg:w-3/5 glass-panel p-3 md:p-5 rounded-[2rem] relative flex justify-center items-center shadow-[0_8px_32px_-8px_rgba(0,0,0,0.05)] border-none">
                <div className="absolute top-8 left-8 z-20 flex flex-wrap items-center gap-2">
                    <div className="px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white text-xs tracking-widest uppercase font-semibold flex items-center gap-2 shadow-xl">
                        <span className={`w-2 h-2 rounded-full ${isCameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'}`}></span>{' '}
                        {isCameraActive ? 'Camera on' : 'Camera off'}
                    </div>
                    {isCameraActive && hasMicTrack && !experimentalWlasl && (
                        <div className="px-4 py-1.5 rounded-full bg-sky-500/35 backdrop-blur-md border border-white/25 text-white text-[0.65rem] tracking-widest uppercase font-semibold flex items-center gap-2 shadow-xl">
                            <span className={`w-2 h-2 rounded-full ${liveCaptionActive ? 'bg-amber-300 animate-pulse' : 'bg-sky-200'}`} />
                            Live captions
                        </div>
                    )}
                </div>
                <div className="relative w-full rounded-2xl overflow-hidden bg-black/5 border border-black/5 aspect-[4/3] shadow-[inset_0_4px_24px_rgba(0,0,0,0.03)] flex items-center justify-center">
                    {!isCameraActive && <span className="text-black/30 font-medium tracking-wide">Waiting for camera feed...</span>}
                    <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 opacity-90 ${!isCameraActive ? 'hidden' : ''}`}></video>
                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover z-10 transform -scale-x-100"></canvas>
                </div>
            </div>
            
            {/* Live Translation UI */}
            <div className="w-full lg:w-2/5 glass-panel p-6 md:p-8 rounded-[2rem] flex flex-col shadow-[0_8px_32px_-8px_rgba(0,0,0,0.05)] border-none min-h-0">
                <h3 className="text-xl font-semibold tracking-tight font-['Inter'] text-black/90 mb-4 pb-4 border-b border-black/5 flex justify-between items-center gap-2">
                    Prediction
                    <span className={`text-[0.65rem] uppercase tracking-widest font-semibold px-3 py-1 rounded-full border shrink-0 ${status.classes}`}>
                        {status.text}
                    </span>
                </h3>
                
                <div className="flex-grow flex flex-col justify-center items-center py-6 md:py-8">
                    {apiOffline && isCameraActive && !experimentalWlasl && (
                        <p className="text-center text-xs text-amber-800 bg-amber-50 border border-amber-200/80 rounded-xl px-4 py-3 mb-6 max-w-sm leading-relaxed">
                            <span className="block font-semibold text-amber-900 mb-1">502 — classifier API is not running</span>
                            From the <code className="font-mono text-[0.7rem]">frontend</code> folder run{' '}
                            <code className="font-mono text-[0.7rem] text-amber-900">npm run dev:all</code>
                            , or in a second terminal:{' '}
                            <code className="font-mono text-[0.7rem] text-amber-900">pip install -r ../backend/requirements.txt</code>{' '}
                            then{' '}
                            <code className="font-mono text-[0.7rem] text-amber-900">npm run dev:api</code>.
                        </p>
                    )}
                    <span className="text-xs uppercase tracking-widest text-black/40 font-bold mb-6">
                        {experimentalWlasl ? 'Current gloss' : 'Current Vector'}
                    </span>
                    <div
                        className={`font-light font-['Inter'] text-black/80 drop-shadow-sm flex items-center justify-center text-center max-w-full px-2 ${
                            experimentalWlasl
                                ? 'text-3xl sm:text-4xl md:text-5xl leading-tight tracking-tight break-words'
                                : 'text-8xl md:text-[8rem] tracking-tighter'
                        }`}
                    >
                        <span className="relative text-black/90 text-transparent bg-clip-text bg-gradient-to-br from-black/90 to-black/60">
                            {!isCameraActive
                                ? '-'
                                : experimentalWlasl
                                  ? wlaslError
                                    ? '—'
                                    : (wlaslWord ?? '…')
                                  : predictedVector}
                        </span>
                    </div>
                    {isCameraActive &&
                        !experimentalWlasl &&
                        predictionConfidence !== null && (
                        <div className="mt-8 px-4 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-50 text-emerald-700 text-xs font-medium tracking-wide">
                            Confidence: {(predictionConfidence * 100).toFixed(1)}%
                        </div>
                    )}
                    {isCameraActive && experimentalWlasl && wlaslConfidence !== null && !wlaslError && (
                        <div className="mt-8 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-50 text-indigo-700 text-xs font-medium tracking-wide">
                            Confidence: {(wlaslConfidence * 100).toFixed(1)}%
                        </div>
                    )}

                    {experimentalWlasl && wlaslError && (
                        <div className="mt-6 w-full max-w-sm rounded-2xl border border-red-200/80 bg-red-50/50 px-4 py-3 text-left">
                            <div className="text-[0.65rem] uppercase tracking-widest text-red-800/80 font-bold mb-1">
                                WLASL error
                            </div>
                            <p className="text-xs text-red-700/95 leading-snug">{wlaslError}</p>
                        </div>
                    )}
                </div>

                <div className="mt-auto w-full space-y-4">
                    {experimentalWlasl ? (
                        <p className="text-center text-xs text-black/45 px-2">
                            Fingerspelling, shared transcript, partner-speech captioning, and voice slider are off while WLASL experimental mode is on.
                        </p>
                    ) : (
                        <div className="rounded-2xl border border-violet-200/60 bg-violet-50/40 px-4 py-3">
                            <div className="flex justify-between items-center gap-3 mb-2">
                                <span className="text-[0.65rem] uppercase tracking-widest text-violet-900/70 font-bold">
                                    Speak signs aloud (Gemini TTS)
                                </span>
                                <span className="text-[0.65rem] font-mono text-violet-700/80 tabular-nums">
                                    {speakLevel === 0 ? 'Off' : `${speakLevel}%`}
                                </span>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={speakLevel}
                                onChange={(e) => setSpeakLevel(Number(e.target.value))}
                                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-violet-600 bg-violet-200/60"
                                aria-label="Speak aloud volume"
                            />
                            <p className="mt-2 text-[0.65rem] text-black/45 leading-snug">
                                When you finish a signed word (a space is inserted after a pause), that word can be spoken for your partner. Partner speech in the transcript is not re-read by TTS.
                                {narrateSource === 'fallback' && speakLevel > 0 && (
                                    <span className="block mt-1 text-amber-700/90">Using browser voice (add API key for Gemini TTS).</span>
                                )}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {!experimentalWlasl && (
            <section className="w-full glass-panel p-6 md:p-10 rounded-[2rem] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.05)] border-none flex flex-col gap-6">
                {captionApiHint && (
                    <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-left text-xs text-amber-950/90 leading-relaxed">
                        {captionApiHint}
                    </div>
                )}

                {/* Hearing person transcript */}
                <div>
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0" />
                            <h4 className="text-sm font-semibold font-['Inter'] text-black/80 tracking-tight">
                                Hearing person
                                <span className="ml-2 text-[0.6rem] uppercase tracking-widest text-black/40 font-semibold">{hearingLang}</span>
                            </h4>
                        </div>
                        <button
                            type="button"
                            onClick={() => setHearingTranscript('')}
                            disabled={!hearingTranscript}
                            className="text-[0.6rem] uppercase tracking-widest font-semibold text-black/35 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            Clear
                        </button>
                    </div>
                    <div className="min-h-[120px] rounded-2xl bg-sky-50/40 border border-sky-200/40 shadow-[inset_0_2px_12px_rgba(0,0,0,0.02)] p-5 md:p-6 overflow-y-auto">
                        <p className="font-['Inter'] text-base md:text-lg text-black/80 font-normal leading-relaxed whitespace-pre-wrap break-words w-full">
                            {hearingTranscript}
                            {liveSpeechDraft ? (
                                <span className="text-sky-600/70 italic">{liveSpeechDraft}</span>
                            ) : null}
                            {!hearingTranscript && !liveSpeechDraft && (
                                <span className="text-black/25 italic">Speech from the hearing person appears here…</span>
                            )}
                        </p>
                    </div>
                </div>

                {/* Deaf person transcript */}
                <div>
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                            <h4 className="text-sm font-semibold font-['Inter'] text-black/80 tracking-tight">
                                Deaf person
                                <span className="ml-2 text-[0.6rem] uppercase tracking-widest text-black/40 font-semibold">{deafLang}</span>
                            </h4>
                        </div>
                        <button
                            type="button"
                            onClick={() => setTranslationSequence((prev) => prev.slice(0, -1))}
                            className="shrink-0 bg-red-50 text-red-500 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-full text-[0.6rem] transition-colors uppercase tracking-widest font-semibold flex items-center gap-1.5 shadow-sm"
                        >
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" /></svg>
                            Backspace
                        </button>
                    </div>
                    <div className="min-h-[120px] rounded-2xl bg-emerald-50/40 border border-emerald-200/40 shadow-[inset_0_2px_12px_rgba(0,0,0,0.02)] p-5 md:p-6 overflow-y-auto">
                        <p className="font-['Inter'] text-base md:text-lg text-black/80 font-normal leading-relaxed whitespace-pre-wrap break-words w-full">
                            {translationSequence}
                            <span className="text-emerald-600 font-light animate-pulse">▍</span>
                        </p>
                    </div>
                </div>
            </section>
        )}
        </div>
    </main>
  );
};

export default Demo;
