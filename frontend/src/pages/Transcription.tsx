import { useCallback, useEffect, useRef, useState } from 'react';

const apiBase =
  import.meta.env.VITE_API_BASE_URL != null && String(import.meta.env.VITE_API_BASE_URL).trim() !== ''
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '')
    : '';

const transcribeUrl = apiBase ? `${apiBase}/gemini/transcribe` : '/api/gemini/transcribe';

const CHUNK_MS = 3500;

function pickRecorderMime(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const d = r.result as string;
      const i = d.indexOf(',');
      resolve(i >= 0 ? d.slice(i + 1) : d);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const Transcription = () => {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState<{ text: string; tone: 'idle' | 'ok' | 'warn' | 'err' }>({
    text: 'Mic off',
    tone: 'idle',
  });
  const [processing, setProcessing] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mimeRef = useRef<string>('audio/webm');
  const inFlightRef = useRef(false);

  const stopStreams = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const sendChunk = useCallback(async (blob: Blob) => {
    if (inFlightRef.current || blob.size < 200) return;
    inFlightRef.current = true;
    setProcessing(true);
    try {
      const b64 = await blobToBase64(blob);
      const res = await fetch(transcribeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_base64: b64,
          mime_type: mimeRef.current || 'audio/webm',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        text?: string;
        skipped?: boolean;
        detail?: string | { detail?: string };
      };

      if (!res.ok) {
        let detail = res.statusText;
        const d = data.detail;
        if (typeof d === 'string') detail = d;
        else if (Array.isArray(d))
          detail = d.map((x: { msg?: string }) => x?.msg ?? JSON.stringify(x)).join('; ');
        else if (d && typeof d === 'object' && 'detail' in d && typeof (d as { detail: string }).detail === 'string')
          detail = (d as { detail: string }).detail;
        setStatus({ text: `Error: ${detail}`, tone: 'err' });
        return;
      }

      if (data.skipped) return;

      const line = (data.text ?? '').trim();
      if (line) {
        setTranscript((t) => (t ? `${t} ${line}` : line));
        setStatus({ text: 'Listening…', tone: 'ok' });
      }
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : 'Network error',
        tone: 'err',
      });
    } finally {
      inFlightRef.current = false;
      setProcessing(false);
    }
  }, []);

  const startListening = useCallback(async () => {
    setStatus({ text: 'Requesting microphone…', tone: 'idle' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      streamRef.current = stream;

      const mime = pickRecorderMime();
      mimeRef.current = mime ?? 'audio/webm';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;

      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 200) void sendChunk(ev.data);
      };
      rec.onerror = () => {
        setStatus({ text: 'Recorder error', tone: 'err' });
      };

      rec.start(CHUNK_MS);
      setListening(true);
      setStatus({ text: 'Listening…', tone: 'ok' });
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : 'Could not access microphone',
        tone: 'err',
      });
      stopStreams();
      setListening(false);
    }
  }, [sendChunk, stopStreams]);

  const stopListening = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.requestData?.();
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    stopStreams();
    recorderRef.current = null;
    setListening(false);
    setStatus({ text: 'Mic off', tone: 'idle' });
  }, [stopStreams]);

  useEffect(() => {
    return () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
      recorderRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const statusClasses =
    status.tone === 'ok'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : status.tone === 'warn'
        ? 'bg-amber-50 text-amber-800 border-amber-100'
        : status.tone === 'err'
          ? 'bg-red-50 text-red-700 border-red-100'
          : 'bg-black/5 text-black/50 border-black/10';

  return (
    <main className="flex-grow flex flex-col items-center px-6 pt-10 pb-20 w-full max-w-4xl mx-auto animate-spring-up">
      <div className="text-center mb-12 w-full max-w-2xl">
        <div className="text-xs uppercase tracking-[0.2em] text-sky-600 font-semibold mb-4">Gemini speech-to-text</div>
        <h1 className="text-4xl md:text-5xl font-light tracking-wide mb-5 font-['Inter']">Live captions</h1>
        <p className="text-lg text-black/60 font-light leading-relaxed">
          Point the device microphone toward the person speaking (or use a headset mic). Short audio clips are sent to
          your backend and transcribed with Gemini so you can read what is being said—no lip reading required.
        </p>
      </div>

      <div className="w-full glass-panel p-6 md:p-10 rounded-[2rem] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.05)] border-none">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-6 border-b border-black/5">
          <h2 className="text-xl font-semibold font-['Inter'] text-black/90">Transcript</h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-[0.65rem] uppercase tracking-widest font-semibold px-3 py-1.5 rounded-full border ${statusClasses}`}>
              {processing ? 'Transcribing…' : status.text}
            </span>
            {!listening ? (
              <button
                type="button"
                onClick={startListening}
                className="px-7 py-2.5 rounded-full font-bold text-xs tracking-widest uppercase shadow-md transition-all duration-300 bg-sky-500 hover:bg-sky-600 text-white hover:-translate-y-0.5"
              >
                Start listening
              </button>
            ) : (
              <button
                type="button"
                onClick={stopListening}
                className="px-7 py-2.5 rounded-full font-bold text-xs tracking-widest uppercase shadow-md transition-all duration-300 bg-red-500 hover:bg-red-600 text-white hover:-translate-y-0.5"
              >
                Stop
              </button>
            )}
            <button
              type="button"
              onClick={() => setTranscript('')}
              disabled={!transcript}
              className="px-5 py-2.5 rounded-full text-xs font-semibold tracking-wide border border-black/10 bg-white/60 text-black/70 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white/50 border border-white/70 shadow-[inset_0_2px_12px_rgba(0,0,0,0.03)] min-h-[220px] max-h-[min(50vh,420px)] overflow-y-auto p-6 md:p-8">
          {transcript ? (
            <p className="font-['Inter'] text-xl md:text-2xl font-light leading-relaxed text-black/85 whitespace-pre-wrap break-words">
              {transcript}
            </p>
          ) : (
            <p className="text-black/35 font-light text-center py-12">
              {listening ? 'Waiting for speech in the next few seconds…' : 'Press start and allow the microphone.'}
            </p>
          )}
        </div>

        <p className="mt-6 text-[0.7rem] text-black/45 leading-relaxed text-center">
          Requires <code className="font-mono text-[0.65rem]">GEMINI_API_KEY</code> on the server and the API running (
          <code className="font-mono text-[0.65rem]">npm run dev:all</code> or proxy to your backend). Audio is sent in
          ~{CHUNK_MS / 1000}s chunks; privacy depends on your deployment.
        </p>
      </div>
    </main>
  );
};

export default Transcription;
