import { describe, expect, it } from 'vitest';
import {
  createCircuitBreaker,
  recordCircuitFailure,
  canAttemptInference,
  determineRecoveryStrategy,
  isInferenceFailureEvent,
  type InferenceFailureEvent,
} from '../lib/inferenceErrorBoundary';

describe('SignBridge Inference Error Boundary & Recovery Strategies', () => {
  it('creates default circuit breaker with closed state', () => {
    const cb = createCircuitBreaker(3, 10000);
    expect(cb.isOpen).toBe(false);
    expect(cb.failureCount).toBe(0);
    expect(cb.maxConsecutiveFailures).toBe(3);
    expect(canAttemptInference(cb)).toBe(true);
  });

  it('opens circuit breaker when consecutive failures reach threshold', () => {
    let cb = createCircuitBreaker(2, 5000);
    const now = 100000;
    cb = recordCircuitFailure(cb, now);
    expect(cb.isOpen).toBe(false);
    expect(cb.failureCount).toBe(1);

    cb = recordCircuitFailure(cb, now + 100);
    expect(cb.isOpen).toBe(true);
    expect(cb.failureCount).toBe(2);
    expect(canAttemptInference(cb, now + 200)).toBe(false);
  });

  it('permits trial attempt after cooldown period expires (half-open)', () => {
    let cb = createCircuitBreaker(2, 5000);
    const now = 100000;
    cb = recordCircuitFailure(cb, now);
    cb = recordCircuitFailure(cb, now + 100);
    expect(cb.isOpen).toBe(true);

    // During cooldown
    expect(canAttemptInference(cb, now + 3000)).toBe(false);
    // After cooldown
    expect(canAttemptInference(cb, now + 5105)).toBe(true);
  });

  it('restarts worker on first WebGL context loss', () => {
    const event: InferenceFailureEvent = {
      category: 'WEBGL_CONTEXT_LOST',
      message: 'CONTEXT_LOST_WEBGL',
      timestamp: Date.now(),
      consecutiveFailures: 1,
      executionProvider: 'webgl',
    };
    const action = determineRecoveryStrategy(event);
    expect(action.strategy).toBe('RESTART_WORKER');
    expect(action.shouldAlertUser).toBe(false);
  });

  it('falls back to WASM on repeated WebGL context loss', () => {
    const event: InferenceFailureEvent = {
      category: 'WEBGL_CONTEXT_LOST',
      message: 'CONTEXT_LOST_WEBGL repeated',
      timestamp: Date.now(),
      consecutiveFailures: 2,
      executionProvider: 'webgl',
    };
    const action = determineRecoveryStrategy(event);
    expect(action.strategy).toBe('FALLBACK_TO_WASM');
    expect(action.targetProvider).toBe('wasm');
    expect(action.shouldAlertUser).toBe(true);
  });

  it('throttles FPS on latency spike', () => {
    const event: InferenceFailureEvent = {
      category: 'LATENCY_SPIKE',
      message: 'Frame inference exceeded 350ms',
      timestamp: Date.now(),
      consecutiveFailures: 1,
      measuredLatencyMs: 380,
      executionProvider: 'webgl',
    };
    const action = determineRecoveryStrategy(event);
    expect(action.strategy).toBe('THROTTLE_FPS');
    expect(action.recommendedThrottleFps).toBe(10);
  });

  it('degrades to heuristics when neural weights buffer is corrupt', () => {
    const event: InferenceFailureEvent = {
      category: 'MODEL_BUFFER_CORRUPT',
      message: 'CRC32 checksum mismatch on ONNX weights',
      timestamp: Date.now(),
      consecutiveFailures: 1,
      executionProvider: 'wasm',
    };
    const action = determineRecoveryStrategy(event);
    expect(action.strategy).toBe('DEGRADE_TO_HEURISTICS');
    expect(action.shouldAlertUser).toBe(true);
  });

  it('validates unknown payload with isInferenceFailureEvent type guard', () => {
    const valid = {
      category: 'OOM_TEXTURE_ALLOCATION',
      message: 'Out of VRAM',
      timestamp: 1234567,
      consecutiveFailures: 1,
      executionProvider: 'webgl',
    };
    expect(isInferenceFailureEvent(valid)).toBe(true);
    expect(isInferenceFailureEvent(null)).toBe(false);
    expect(isInferenceFailureEvent({ category: 'UNKNOWN' })).toBe(false);
    expect(isInferenceFailureEvent({ ...valid, executionProvider: 'cuda' })).toBe(false);
  });
});
