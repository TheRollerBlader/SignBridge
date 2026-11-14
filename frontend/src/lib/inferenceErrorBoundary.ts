/**
 * Strict type safety contracts and error boundary recovery logic
 * for client-side ONNX / WebGL neural gesture inference in SignBridge.
 *
 * Implements automated circuit breaking, WebGL context restoration,
 * throttle backoff, and graceful fallback to heuristic recognizers.
 */

export type InferenceErrorCategory =
  | 'WEBGL_CONTEXT_LOST'
  | 'OOM_TEXTURE_ALLOCATION'
  | 'CONFIDENCE_DROP'
  | 'LATENCY_SPIKE'
  | 'MODEL_BUFFER_CORRUPT'
  | 'WORKER_TERMINATED';

export interface InferenceFailureEvent {
  category: InferenceErrorCategory;
  message: string;
  timestamp: number;
  consecutiveFailures: number;
  measuredLatencyMs?: number;
  executionProvider: 'webgl' | 'wasm' | 'webgpu';
}

export type RecoveryStrategy =
  | 'RESTART_WORKER'
  | 'FALLBACK_TO_WASM'
  | 'THROTTLE_FPS'
  | 'RESET_ACCUMULATOR'
  | 'DEGRADE_TO_HEURISTICS'
  | 'CIRCUIT_OPEN';

export interface RecoveryAction {
  strategy: RecoveryStrategy;
  recommendedThrottleFps?: number;
  targetProvider?: 'wasm' | 'webgl';
  shouldAlertUser: boolean;
  userFacingNotice?: string;
}

export interface CircuitBreakerState {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime: number;
  maxConsecutiveFailures: number;
  coolDownPeriodMs: number;
}

/**
 * Creates an initialized circuit breaker state.
 */
export function createCircuitBreaker(
  maxFailures = 5,
  coolDownMs = 15000
): CircuitBreakerState {
  return {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: 0,
    maxConsecutiveFailures: Math.max(1, maxFailures),
    coolDownPeriodMs: Math.max(1000, coolDownMs),
  };
}

/**
 * Records a failure and updates the circuit breaker state.
 */
export function recordCircuitFailure(
  state: CircuitBreakerState,
  now = Date.now()
): CircuitBreakerState {
  // If cooled down since last failure, reset counter
  const timeSinceLast = now - state.lastFailureTime;
  const currentCount = timeSinceLast > state.coolDownPeriodMs ? 1 : state.failureCount + 1;
  const isOpen = currentCount >= state.maxConsecutiveFailures;

  return {
    ...state,
    failureCount: currentCount,
    lastFailureTime: now,
    isOpen,
  };
}

/**
 * Determines whether a call is allowed through the circuit breaker.
 */
export function canAttemptInference(
  state: CircuitBreakerState,
  now = Date.now()
): boolean {
  if (!state.isOpen) return true;
  // If cooldown passed, permit a trial attempt (half-open behavior)
  return now - state.lastFailureTime > state.coolDownPeriodMs;
}

/**
 * Determines the optimal deterministic recovery action given an inference failure event.
 */
export function determineRecoveryStrategy(
  event: InferenceFailureEvent,
  circuitState?: CircuitBreakerState
): RecoveryAction {
  if (circuitState && circuitState.isOpen) {
    return {
      strategy: 'CIRCUIT_OPEN',
      shouldAlertUser: true,
      userFacingNotice: 'Inference pipeline suspended due to repeated subsystem failures. Operating in offline heuristic mode.',
    };
  }

  switch (event.category) {
    case 'WEBGL_CONTEXT_LOST':
      if (event.consecutiveFailures >= 2) {
        return {
          strategy: 'FALLBACK_TO_WASM',
          targetProvider: 'wasm',
          shouldAlertUser: true,
          userFacingNotice: 'WebGL hardware acceleration lost repeatedly. Falling back to CPU/WASM execution.',
        };
      }
      return {
        strategy: 'RESTART_WORKER',
        shouldAlertUser: false,
      };

    case 'OOM_TEXTURE_ALLOCATION':
      return {
        strategy: 'FALLBACK_TO_WASM',
        targetProvider: 'wasm',
        shouldAlertUser: true,
        userFacingNotice: 'GPU memory constraint reached. Switching to WASM backend.',
      };

    case 'LATENCY_SPIKE': {
      const latency = event.measuredLatencyMs ?? 200;
      const targetFps = latency > 300 ? 10 : 15;
      return {
        strategy: 'THROTTLE_FPS',
        recommendedThrottleFps: targetFps,
        shouldAlertUser: false,
      };
    }

    case 'CONFIDENCE_DROP':
      return {
        strategy: 'RESET_ACCUMULATOR',
        shouldAlertUser: false,
      };

    case 'MODEL_BUFFER_CORRUPT':
      return {
        strategy: 'DEGRADE_TO_HEURISTICS',
        shouldAlertUser: true,
        userFacingNotice: 'Neural weights buffer validation failed. Falling back to rule-based fingerspelling heuristics.',
      };

    case 'WORKER_TERMINATED':
      return {
        strategy: 'RESTART_WORKER',
        shouldAlertUser: false,
      };

    default: {
      const _exhaustiveCheck: never = event.category;
      return {
        strategy: 'DEGRADE_TO_HEURISTICS',
        shouldAlertUser: true,
      };
    }
  }
}

/**
 * Type guard for validating runtime unknown objects against InferenceFailureEvent.
 */
export function isInferenceFailureEvent(obj: unknown): obj is InferenceFailureEvent {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  const validCategories: readonly string[] = [
    'WEBGL_CONTEXT_LOST',
    'OOM_TEXTURE_ALLOCATION',
    'CONFIDENCE_DROP',
    'LATENCY_SPIKE',
    'MODEL_BUFFER_CORRUPT',
    'WORKER_TERMINATED',
  ];
  return (
    typeof o.category === 'string' &&
    validCategories.includes(o.category) &&
    typeof o.message === 'string' &&
    typeof o.timestamp === 'number' &&
    typeof o.consecutiveFailures === 'number' &&
    (o.executionProvider === 'webgl' || o.executionProvider === 'wasm' || o.executionProvider === 'webgpu')
  );
}
