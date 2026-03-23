/** WebSocket URL for Gemini Live transcription proxy (Vite proxies /api → backend). */
export function buildLiveTranscribeWsUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  const base = raw != null && String(raw).trim() !== '' ? String(raw).replace(/\/$/, '') : '';
  if (base) {
    const u = new URL(base);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = `${u.pathname.replace(/\/$/, '')}/ws/live-transcribe`;
    return u.toString();
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/api/ws/live-transcribe`;
}

function downsampleBuffer(buffer: Float32Array, sampleRate: number, outSampleRate: number): Float32Array {
  if (outSampleRate >= sampleRate) return buffer;
  const ratio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function floatTo16BitPCM(buffer: Float32Array): ArrayBuffer {
  const l = buffer.length;
  const out = new ArrayBuffer(l * 2);
  const view = new DataView(out);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

export type LiveCaptionHandlers = {
  onTranscript: (text: string, finished: boolean) => void;
  onTranslation?: (text: string) => void;
  onError?: (message: string) => void;
  onConnection?: (open: boolean) => void;
};

/** Handle returned by startLiveCaptionSession. */
export interface LiveCaptionHandle {
  /** Stop sending mic data (e.g. while TTS is playing to prevent echo). */
  mute: () => void;
  /** Resume sending mic data. */
  unmute: () => void;
  /** Tear down everything. */
  dispose: () => void;
}

function isTrivial(s: string): boolean {
  const t = s.trim();
  return t === '' || /^[.\u2026,;:!?\-–—]+$/.test(t);
}

/** Target ~100ms of 16 kHz PCM per WebSocket message (1600 samples × 2 bytes). */
const SEND_BUFFER_BYTES = 3200;

/**
 * Stream mic as 16 kHz little-endian PCM over WebSocket; server forwards to Gemini Live.
 * Returns a LiveCaptionHandle with mute/unmute/dispose.
 */
export async function startLiveCaptionSession(
  mediaStream: MediaStream,
  handlers: LiveCaptionHandlers,
  opts?: { apiKey?: string; deafLang?: string; hearingLang?: string }
): Promise<LiveCaptionHandle> {
  const url = new URL(buildLiveTranscribeWsUrl());
  if (opts?.apiKey) url.searchParams.set('key', opts.apiKey);
  if (opts?.deafLang) url.searchParams.set('deaf_lang', opts.deafLang);
  if (opts?.hearingLang) url.searchParams.set('hearing_lang', opts.hearingLang);
  const ws = new WebSocket(url.toString());
  ws.binaryType = 'arraybuffer';

  const audioContext = new AudioContext();
  await audioContext.audioWorklet.addModule('/pcm-processor.js');
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const source = audioContext.createMediaStreamSource(mediaStream);
  const worklet = new AudioWorkletNode(audioContext, 'pcm-processor');
  const silentDest = audioContext.createMediaStreamDestination();

  let sendBuf = new Uint8Array(SEND_BUFFER_BYTES);
  let sendBufOffset = 0;

  worklet.port.onmessage = (ev: MessageEvent<Float32Array>) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (muted) return;
    const f32 = ev.data;
    const down = downsampleBuffer(f32, audioContext.sampleRate, 16000);
    if (down.length === 0) return;
    const pcm = floatTo16BitPCM(down);
    const chunk = new Uint8Array(pcm);

    let chunkOff = 0;
    while (chunkOff < chunk.length) {
      const space = sendBuf.length - sendBufOffset;
      const take = Math.min(space, chunk.length - chunkOff);
      sendBuf.set(chunk.subarray(chunkOff, chunkOff + take), sendBufOffset);
      sendBufOffset += take;
      chunkOff += take;

      if (sendBufOffset >= sendBuf.length) {
        ws.send(sendBuf.buffer);
        sendBuf = new Uint8Array(SEND_BUFFER_BYTES);
        sendBufOffset = 0;
      }
    }
  };

  source.connect(worklet);
  worklet.connect(silentDest);

  let closed = false;
  let muted = false;
  let draftAccum = '';

  ws.onopen = () => {
    handlers.onConnection?.(true);
    const ping = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, 30000);
    (ws as WebSocket & { _ping?: number })._ping = ping;
  };

  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return;
    try {
      const msg = JSON.parse(ev.data) as {
        type?: string;
        text?: string;
        finished?: boolean;
        message?: string;
      };

      if (msg.type === 'transcript') {
        const text = msg.text ?? '';
        if (msg.finished) {
          const commit = isTrivial(text) ? draftAccum : text;
          draftAccum = '';
          if (!isTrivial(commit)) {
            handlers.onTranscript(commit, true);
          } else {
            handlers.onTranscript('', true);
          }
        } else {
          if (!isTrivial(text)) draftAccum = text;
          handlers.onTranscript(text, false);
        }
      } else if (msg.type === 'translation' && msg.text) {
        handlers.onTranslation?.(msg.text);
      } else if (msg.type === 'error' && msg.message) {
        handlers.onError?.(msg.message);
      }
    } catch {
      /* ignore */
    }
  };

  ws.onerror = () => {
    handlers.onError?.('WebSocket error');
  };

  ws.onclose = () => {
    const ping = (ws as WebSocket & { _ping?: number })._ping;
    if (ping) window.clearInterval(ping);
    if (!closed) {
      closed = true;
      try {
        worklet.disconnect();
        source.disconnect();
        silentDest.disconnect();
      } catch {
        /* ignore */
      }
      void audioContext.close();
      handlers.onConnection?.(false);
    }
  };

  const dispose = () => {
    if (closed) return;
    closed = true;
    const ping = (ws as WebSocket & { _ping?: number })._ping;
    if (ping) window.clearInterval(ping);
    try {
      worklet.disconnect();
      source.disconnect();
      silentDest.disconnect();
    } catch {
      /* ignore */
    }
    void audioContext.close();
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    handlers.onConnection?.(false);
  };

  return {
    mute: () => {
      muted = true;
    },
    unmute: () => {
      muted = false;
    },
    dispose,
  };
}
