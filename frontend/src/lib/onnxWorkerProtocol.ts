import type { InferenceResult, OnnxSessionConfig } from './onnxInferenceTypes';

/**
 * Worker Protocol Message Types and Contracts for Client-Side ONNX Web Workers.
 * Enables zero-copy, non-blocking inference for ASL gesture and fingerspelling recognition.
 */

export type WorkerRequestType = 'INIT_SESSION' | 'RUN_INFERENCE' | 'TERMINATE_SESSION' | 'PING';
export type WorkerResponseType = 'SESSION_READY' | 'INFERENCE_COMPLETE' | 'ERROR' | 'PONG';
export type WorkerLifecycleStatus = 'idle' | 'initializing' | 'ready' | 'busy' | 'error' | 'terminated';

export interface InitSessionPayload {
  config: OnnxSessionConfig;
}

export interface RunInferencePayload {
  tensorBuffer: Float32Array; // 63-element relative coordinate vector
  timestamp: number;
  frameId: number;
}

export interface WorkerInferenceRequest {
  id: string;
  type: WorkerRequestType;
  payload?: InitSessionPayload | RunInferencePayload;
}

export interface SessionReadyPayload {
  executionProvider: string;
  modelPath: string;
  loadDurationMs: number;
}

export interface InferenceCompletePayload {
  frameId: number;
  result: InferenceResult;
}

export interface ErrorPayload {
  code: 'INIT_FAILED' | 'INFERENCE_FAILED' | 'INVALID_PAYLOAD' | 'SESSION_NOT_INITIALIZED';
  message: string;
  details?: unknown;
}

export interface WorkerInferenceResponse {
  id: string;
  type: WorkerResponseType;
  success: boolean;
  payload?: SessionReadyPayload | InferenceCompletePayload | ErrorPayload | { timestamp: number };
}

/**
 * Type guard for WorkerInferenceRequest
 */
export function isWorkerRequest(data: unknown): data is WorkerInferenceRequest {
  if (typeof data !== 'object' || data === null) return false;
  const req = data as Partial<WorkerInferenceRequest>;
  return (
    typeof req.id === 'string' &&
    typeof req.type === 'string' &&
    ['INIT_SESSION', 'RUN_INFERENCE', 'TERMINATE_SESSION', 'PING'].includes(req.type)
  );
}

/**
 * Type guard for WorkerInferenceResponse
 */
export function isWorkerResponse(data: unknown): data is WorkerInferenceResponse {
  if (typeof data !== 'object' || data === null) return false;
  const res = data as Partial<WorkerInferenceResponse>;
  return (
    typeof res.id === 'string' &&
    typeof res.type === 'string' &&
    typeof res.success === 'boolean' &&
    ['SESSION_READY', 'INFERENCE_COMPLETE', 'ERROR', 'PONG'].includes(res.type)
  );
}

/**
 * Helper to construct an inference request with transferable buffer tracking
 */
export function createInferenceRequest(
  tensor: Float32Array,
  frameId: number
): { message: WorkerInferenceRequest; transferables: Transferable[] } {
  const message: WorkerInferenceRequest = {
    id: `inf_${frameId}_${Date.now()}`,
    type: 'RUN_INFERENCE',
    payload: {
      tensorBuffer: tensor,
      timestamp: performance.now(),
      frameId
    }
  };

  // If underlying buffer is eligible for transfer, include it
  const transferables: Transferable[] = tensor.buffer ? [tensor.buffer] : [];
  return { message, transferables };
}

/**
 * Helper to construct a typed error response from worker
 */
export function createErrorResponse(
  id: string,
  code: ErrorPayload['code'],
  message: string,
  details?: unknown
): WorkerInferenceResponse {
  return {
    id,
    type: 'ERROR',
    success: false,
    payload: {
      code,
      message,
      details
    }
  };
}

/**
 * Helper to construct a success inference response
 */
export function createSuccessResponse(
  id: string,
  frameId: number,
  result: InferenceResult
): WorkerInferenceResponse {
  return {
    id,
    type: 'INFERENCE_COMPLETE',
    success: true,
    payload: {
      frameId,
      result
    }
  };
}
