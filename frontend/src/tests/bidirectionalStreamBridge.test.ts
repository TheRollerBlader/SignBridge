import { describe, expect, it, vi } from 'vitest';
import { BidirectionalStreamBridge } from '../lib/bidirectionalStreamBridge';

describe('BidirectionalStreamBridge', () => {
  it('initializes with disconnected status and empty dialogue', () => {
    const bridge = new BidirectionalStreamBridge();
    expect(bridge.getStatus()).toBe('disconnected');
    expect(bridge.getMessages()).toEqual([]);
  });

  it('ingests and updates streaming speech chunks incrementally', () => {
    const bridge = new BidirectionalStreamBridge();
    const listener = vi.fn();
    bridge.onMessagesChange(listener);

    bridge.ingestSpeechChunk('chunk_1', 'Hello', false, 0.85);
    expect(bridge.getMessages()).toHaveLength(1);
    expect(bridge.getMessages()[0].text).toBe('Hello');
    expect(bridge.getMessages()[0].isFinal).toBe(false);

    // Update the same chunk with completed transcription
    bridge.ingestSpeechChunk('chunk_1', 'Hello, how can I help you today?', true, 0.98);
    expect(bridge.getMessages()).toHaveLength(1);
    expect(bridge.getMessages()[0].text).toBe('Hello, how can I help you today?');
    expect(bridge.getMessages()[0].isFinal).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('ingests ASL signer prediction events with gloss tokens', () => {
    const bridge = new BidirectionalStreamBridge();
    const msg = bridge.ingestSignPrediction(
      'sign_1',
      'THANK YOU',
      0.96,
      true,
      ['THANK', 'YOU']
    );

    expect(msg.participant).toBe('signer');
    expect(msg.confidence).toBe(0.96);
    expect(msg.rawGloss).toEqual(['THANK', 'YOU']);
    expect(bridge.getMessages()).toHaveLength(1);
  });

  it('computes exponential backoff and tracks connection failures', () => {
    const bridge = new BidirectionalStreamBridge({
      baseBackoffMs: 200,
      maxBackoffMs: 1600,
      reconnectAttempts: 3,
    });

    expect(bridge.getBackoffDelayMs()).toBe(200);

    // First failure
    expect(bridge.recordConnectionFailure()).toBe(true);
    expect(bridge.getStatus()).toBe('reconnecting');
    expect(bridge.getBackoffDelayMs()).toBe(400);

    // Second failure
    expect(bridge.recordConnectionFailure()).toBe(true);
    expect(bridge.getBackoffDelayMs()).toBe(800);

    // Third failure
    expect(bridge.recordConnectionFailure()).toBe(true);
    expect(bridge.getBackoffDelayMs()).toBe(1600);

    // Exceed max attempts
    expect(bridge.recordConnectionFailure()).toBe(false);
    expect(bridge.getStatus()).toBe('error');

    // On successful recovery
    bridge.recordConnectionSuccess();
    expect(bridge.getStatus()).toBe('connected');
    expect(bridge.getBackoffDelayMs()).toBe(200);
  });

  it('clears dialogue state when requested', () => {
    const bridge = new BidirectionalStreamBridge();
    bridge.ingestSpeechChunk('s1', 'Test', true);
    expect(bridge.getMessages()).toHaveLength(1);
    bridge.clearDialogue();
    expect(bridge.getMessages()).toHaveLength(0);
  });

  it('connects over WebSocket, ingests transcript/sign frames, sends PCM, and reconnects on drop', () => {
    vi.useFakeTimers();
    try {
      const sockets: Array<{
        url: string;
        readyState: number;
        sent: unknown[];
        onopen: ((ev: unknown) => void) | null;
        onmessage: ((ev: { data: unknown }) => void) | null;
        onerror: ((ev: unknown) => void) | null;
        onclose: ((ev: unknown) => void) | null;
        send: (data: unknown) => void;
        close: () => void;
      }> = [];

      const bridge = new BidirectionalStreamBridge({
        wsEndpoint: 'ws://localhost:8000/ws/live-transcribe',
        baseBackoffMs: 250,
        maxBackoffMs: 1000,
        reconnectAttempts: 2,
        heartbeatIntervalMs: 5000,
      });

      bridge.connect((url) => {
        const sock = {
          url,
          readyState: 1,
          sent: [] as unknown[],
          onopen: null as ((ev: unknown) => void) | null,
          onmessage: null as ((ev: { data: unknown }) => void) | null,
          onerror: null as ((ev: unknown) => void) | null,
          onclose: null as ((ev: unknown) => void) | null,
          send(data: unknown) {
            this.sent.push(data);
          },
          close() {
            this.readyState = 3;
          },
        };
        sockets.push(sock);
        return sock;
      });

      expect(bridge.getStatus()).toBe('connecting');
      expect(sockets).toHaveLength(1);

      sockets[0].onopen?.({});
      expect(bridge.getStatus()).toBe('connected');

      // Ingest incoming transcript & sign payloads
      sockets[0].onmessage?.({
        data: JSON.stringify({ type: 'transcript', id: 't1', text: 'Where is the gate?', is_final: true, confidence: 0.94 }),
      });
      sockets[0].onmessage?.({
        data: JSON.stringify({ type: 'sign', id: 'g1', text: 'GATE B4', gloss: ['GATE', 'B4'], isFinal: true, confidence: 0.91 }),
      });

      expect(bridge.getMessages()).toHaveLength(2);
      expect(bridge.getMessages()[0].participant).toBe('speaker');
      expect(bridge.getMessages()[1].rawGloss).toEqual(['GATE', 'B4']);

      // Send PCM and sign event
      expect(bridge.sendAudioFrame(new Uint8Array([1, 2, 3, 4]))).toBe(true);
      expect(bridge.sendSignEvent('HELLO', 0.98, ['HELLO'])).toBe(true);
      expect(sockets[0].sent).toHaveLength(2);

      // Heartbeat fires
      vi.advanceTimersByTime(5000);
      expect(sockets[0].sent).toHaveLength(3);

      // Unexpected drop triggers exponential backoff reconnect
      sockets[0].onclose?.({});
      expect(bridge.getStatus()).toBe('reconnecting');
      vi.advanceTimersByTime(500);
      expect(sockets).toHaveLength(2);

      bridge.disconnect();
      expect(bridge.getStatus()).toBe('disconnected');
    } finally {
      vi.useRealTimers();
    }
  });
});
