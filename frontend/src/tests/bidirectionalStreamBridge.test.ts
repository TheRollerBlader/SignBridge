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
});
