import { useEffect, useRef, useState, useCallback } from 'react';

const Demo = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [status, setStatus] = useState({ text: 'Model Initializing', classes: 'bg-emerald-50 text-emerald-600 border-emerald-100' });
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);

  const [predictedVector, setPredictedVector] = useState<string>('-');
  const [predictionConfidence, setPredictionConfidence] = useState<number | null>(null);
  const [translationSequence, setTranslationSequence] = useState<string>('');

  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const handLandmarkerRef = useRef<any>(null);
  const drawingUtilsRef = useRef<any>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastPredictionRef = useRef<string | null>(null);
  const consecutivePredictionsRef = useRef<number>(0);
  const lastFetchTimeRef = useRef<number>(0);
  const lastHandPresenceTimeRef = useRef<number | null>(null);

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

            if (now - lastFetchTimeRef.current > 100) {
                lastFetchTimeRef.current = now;
                const landmarks = results.landmarks[0];
                fetch('http://localhost:8000/predict', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        landmarks: landmarks,
                        width: videoRef.current.videoWidth,
                        height: videoRef.current.videoHeight
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.letter) {
                        setPredictedVector(data.letter);
                        setPredictionConfidence(data.confidence);

                        if (data.letter === lastPredictionRef.current) {
                            consecutivePredictionsRef.current += 1;
                            if (consecutivePredictionsRef.current === 10) {
                                setTranslationSequence(prev => prev + data.letter);
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
                .catch(err => console.error("Prediction Error: ", err));
            }
          } else {
            if (lastHandPresenceTimeRef.current) {
                if (now - lastHandPresenceTimeRef.current > 500) {
                    setTranslationSequence(prev => {
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

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
      });
      
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
    <main className="flex-grow flex flex-col items-center px-6 pt-10 pb-20 w-full max-w-6xl mx-auto animate-spring-up">
        <div className="text-center mb-16 w-full max-w-3xl">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-600 font-semibold mb-4">Live Browser Inference</div>
            <h1 className="text-5xl md:text-6xl font-light tracking-wide mb-6 font-['Inter']">Real-Time Translation</h1>
            <p className="text-xl text-black/60 font-light leading-relaxed mb-8">
                Hold your hand up to the camera to watch the geometric landmark detection pipeline translate American Sign Language directly in your browser.
            </p>
            <div className="flex justify-center mt-6">
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
        </div>
        
        <div className="w-full flex flex-col lg:flex-row gap-8 items-stretch">
            {/* Camera / Video Feed */}
            <div className="w-full lg:w-2/3 glass-panel p-3 md:p-5 rounded-[2rem] relative flex justify-center items-center shadow-[0_8px_32px_-8px_rgba(0,0,0,0.05)] border-none">
                <div className="absolute top-8 left-8 z-20 flex items-center gap-3">
                    <div className="px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white text-xs tracking-widest uppercase font-semibold flex items-center gap-2 shadow-xl">
                        <span className={`w-2 h-2 rounded-full ${isCameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'}`}></span> {isCameraActive ? 'Camera Active' : 'Camera Off'}
                    </div>
                </div>
                <div className="relative w-full rounded-2xl overflow-hidden bg-black/5 border border-black/5 aspect-[4/3] shadow-[inset_0_4px_24px_rgba(0,0,0,0.03)] flex items-center justify-center">
                    {!isCameraActive && <span className="text-black/30 font-medium tracking-wide">Waiting for camera feed...</span>}
                    <video ref={videoRef} autoPlay playsInline className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 opacity-90 ${!isCameraActive ? 'hidden' : ''}`}></video>
                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover z-10 transform -scale-x-100"></canvas>
                </div>
            </div>
            
            {/* Live Translation UI */}
            <div className="w-full lg:w-1/3 glass-panel p-8 md:p-10 rounded-[2rem] flex flex-col shadow-[0_8px_32px_-8px_rgba(0,0,0,0.05)] border-none">
                <h3 className="text-2xl font-semibold tracking-tight font-['Inter'] text-black/90 mb-4 pb-4 border-b border-black/5 flex justify-between items-center">
                    Prediction
                    <span className={`text-[0.65rem] uppercase tracking-widest font-semibold px-3 py-1 rounded-full border ${status.classes}`}>
                        {status.text}
                    </span>
                </h3>
                
                <div className="flex-grow flex flex-col justify-center items-center py-10">
                    <span className="text-xs uppercase tracking-widest text-black/40 font-bold mb-6">Current Vector</span>
                    <div className="text-8xl md:text-[8rem] font-light font-['Inter'] text-black/80 tracking-tighter drop-shadow-sm flex items-center justify-center">
                        <span className="relative text-black/90 text-transparent bg-clip-text bg-gradient-to-br from-black/90 to-black/60">{isCameraActive ? predictedVector : '-'}</span>
                    </div>
                    {isCameraActive && predictionConfidence !== null && (
                        <div className="mt-8 px-4 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-50 text-emerald-700 text-xs font-medium tracking-wide">
                            Confidence: {(predictionConfidence * 100).toFixed(1)}%
                        </div>
                    )}
                </div>

                <div className="mt-auto w-full">
                    <h4 className="text-[0.65rem] uppercase tracking-widest text-black/40 font-bold mb-3 flex justify-between items-center">
                        Translation Sequence
                        <button onClick={() => setTranslationSequence(prev => prev.slice(0, -1))} className="bg-red-50 text-red-500 hover:bg-red-100 border border-red-200 px-3 py-1 rounded-full text-[0.60rem] transition-colors uppercase tracking-widest font-semibold flex items-center gap-1 shadow-sm">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" /></svg>
                            BSPC
                        </button>
                    </h4>
                    <div className="p-6 rounded-2xl bg-white/40 border border-white/60 shadow-[inset_0_2px_12px_rgba(0,0,0,0.03)] min-h-[120px] flex items-start">
                        <p className="font-mono text-xl tracking-[0.2em] text-black/80 font-medium leading-relaxed uppercase whitespace-pre-wrap break-words w-full">
                            {translationSequence}<span className="text-emerald-500 -ml-1 animate-pulse">_</span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </main>
  );
};

export default Demo;
