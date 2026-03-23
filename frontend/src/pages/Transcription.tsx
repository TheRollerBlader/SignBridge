import { useCallback, useEffect, useRef, useState } from 'react';
import { startLiveCaptionSession, type LiveCaptionHandle } from '../lib/liveCaption';

const API_KEY_STORAGE_KEY = 'signbridge_gemini_api_key';

const Transcription = () => {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState('');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE_KEY) ?? '');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<{ text: string; tone: 'idle' | 'ok' | 'warn' | 'err' }>({
    text: 'Mic off',
    tone: 'idle',
  });

  useEffect(() => {
    if (geminiKey) localStorage.setItem(API_KEY_STORAGE_KEY, geminiKey);
    else localStorage.removeItem(API_KEY_STORAGE_KEY);
  }, [geminiKey]);

  const streamRef = useRef<MediaStream | null>(null);
  const handleRef = useRef<LiveCaptionHandle | null>(null);

  const stopAll = useCallback(() => {
    handleRef.current?.dispose();
    handleRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startListening = useCallback(async () => {
    setStatus({ text: 'Requesting microphone…', tone: 'idle' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      streamRef.current = stream;

      try {
        const handle = await startLiveCaptionSession(stream, {
          onConnection: (open) => {
            if (open) setStatus({ text: 'Listening (Live API)…', tone: 'ok' });
            else setStatus({ text: 'Disconnected', tone: 'warn' });
          },
          onError: (msg) => setStatus({ text: msg.slice(0, 200), tone: 'err' }),
          onTranscript: (text, finished) => {
            if (finished) {
              setDraft('');
              const line = text.trim();
              if (line) setTranscript((t) => (t ? `${t} ${line}` : line));
            } else {
              if (text) setDraft(text);
            }
          },
        }, { apiKey: geminiKey || undefined });
        handleRef.current = handle;
        setListening(true);
      } catch (inner) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        throw inner;
      }
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : 'Could not access microphone',
        tone: 'err',
      });
      stopAll();
      setListening(false);
    }
  }, [stopAll]);

  const stopListening = useCallback(() => {
    stopAll();
    setListening(false);
    setDraft('');
    setStatus({ text: 'Mic off', tone: 'idle' });
  }, [stopAll]);

  useEffect(() => {
    return () => {
      stopAll();
    };
  }, [stopAll]);

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
        <div className="text-xs uppercase tracking-[0.2em] text-sky-600 font-semibold mb-4">Gemini Live API</div>
        <h1 className="text-4xl md:text-5xl font-light tracking-wide mb-5 font-['Inter']">Live captions</h1>
        <p className="text-lg text-black/60 font-light leading-relaxed">
          Audio streams to your backend over WebSockets and into Gemini Live for real-time transcription. Use a headset
          or point the mic at the speaker.
        </p>
      </div>

      <div className="w-full max-w-md flex items-center gap-2 rounded-full border border-black/10 bg-white/60 backdrop-blur-sm px-4 py-2 shadow-sm mb-6">
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
        <p className="text-xs text-amber-700/80 mb-6">Enter your <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline hover:text-amber-900">Gemini API key</a> to enable live captions.</p>
      )}

      <div className="w-full glass-panel p-6 md:p-10 rounded-[2rem] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.05)] border-none">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-6 border-b border-black/5">
          <h2 className="text-xl font-semibold font-['Inter'] text-black/90">Transcript</h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-[0.65rem] uppercase tracking-widest font-semibold px-3 py-1.5 rounded-full border ${statusClasses}`}>
              {status.text}
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
          {transcript || draft ? (
            <p className="font-['Inter'] text-xl md:text-2xl font-light leading-relaxed text-black/85 whitespace-pre-wrap break-words">
              {transcript}
              {draft ? <span className="text-sky-700/80 italic">{draft}</span> : null}
            </p>
          ) : (
            <p className="text-black/35 font-light text-center py-12">
              {listening ? 'Speak — words appear here as you talk…' : 'Press start and allow the microphone.'}
            </p>
          )}
        </div>

        <p className="mt-6 text-[0.7rem] text-black/45 leading-relaxed text-center">
          Enter your Gemini API key above. Run the backend with{' '}
          <code className="font-mono text-[0.65rem]">npm run dev:all</code> (Vite proxies WebSockets under{' '}
          <code className="font-mono text-[0.65rem]">/api</code>).
        </p>
      </div>
    </main>
  );
};

export default Transcription;
