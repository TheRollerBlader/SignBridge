/**
 * Strict runtime type validation and hardware capability guardrails
 * for client-side ONNX Runtime Web inference in SignBridge.
 *
 * Implements Week 1 Milestone: Saturday - Type Safety, Linting & Polish.
 */

import type { InferenceResult, OnnxSessionConfig } from './onnxInferenceTypes';
import type { Landmark3D } from './gestureSmoothing';

export type InferenceErrorCode =
  | 'INVALID_TENSOR_SHAPE'
  | 'EMPTY_LANDMARKS'
  | 'NAN_OR_INF_DETECTED'
  | 'OUT_OF_BOUNDS_COORDINATE'
  | 'PROBABILITY_SUM_INVALID'
  | 'PROVIDER_UNAVAILABLE'
  | 'CONTEXT_LOST'
  | 'UNRECOGNIZED_LABEL';

export interface ValidationError {
  code: InferenceErrorCode;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
}

export interface ValidationSuccess<T> {
  isValid: true;
  data: T;
  warnings?: string[];
}

export interface ValidationFailure {
  isValid: false;
  errors: ValidationError[];
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Validates that an array of 3D landmarks conform strictly to MediaPipe 21-landmark topology.
 */
export function validateHandLandmarks(landmarks: unknown): ValidationResult<Landmark3D[]> {
  const errors: ValidationError[] = [];

  if (!Array.isArray(landmarks)) {
    return {
      isValid: false,
      errors: [
        {
          code: 'EMPTY_LANDMARKS',
          message: 'Expected landmarks to be an array of 21 3D coordinates.'
        }
      ]
    };
  }

  if (landmarks.length !== 21) {
    errors.push({
      code: 'INVALID_TENSOR_SHAPE',
      message: `Expected exactly 21 hand landmarks, received ${landmarks.length}.`,
      details: { count: landmarks.length }
    });
  }

  for (let i = 0; i < landmarks.length; i++) {
    const pt = landmarks[i];
    if (!pt || typeof pt !== 'object') {
      errors.push({
        code: 'NAN_OR_INF_DETECTED',
        message: `Landmark at index ${i} is not a valid coordinate object.`
      });
      continue;
    }

    const { x, y, z } = pt as { x: unknown; y: unknown; z: unknown };
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
      errors.push({
        code: 'NAN_OR_INF_DETECTED',
        message: `Landmark index ${i} has non-numeric coordinates.`
      });
      continue;
    }

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      errors.push({
        code: 'NAN_OR_INF_DETECTED',
        message: `Landmark index ${i} contains NaN or Infinity.`,
        details: { index: i, x, y, z }
      });
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, data: landmarks as Landmark3D[] };
}

/**
 * Validates normalized Float32Array tensor input fed into ONNX classification sessions.
 * Must be 63 contiguous finite floats [21 x (x, y, z)].
 */
export function validateInferenceTensor(tensor: unknown): ValidationResult<Float32Array> {
  if (!(tensor instanceof Float32Array)) {
    return {
      isValid: false,
      errors: [
        {
          code: 'INVALID_TENSOR_SHAPE',
          message: 'Expected tensor to be an instance of Float32Array.'
        }
      ]
    };
  }

  if (tensor.length !== 63) {
    return {
      isValid: false,
      errors: [
        {
          code: 'INVALID_TENSOR_SHAPE',
          message: `Expected flattened tensor length 63, received ${tensor.length}.`,
          details: { length: tensor.length }
        }
      ]
    };
  }

  let nanCount = 0;
  for (let i = 0; i < tensor.length; i++) {
    if (!Number.isFinite(tensor[i])) {
      nanCount++;
    }
  }

  if (nanCount > 0) {
    return {
      isValid: false,
      errors: [
        {
          code: 'NAN_OR_INF_DETECTED',
          message: `Tensor contains ${nanCount} non-finite floating point values.`
        }
      ]
    };
  }

  return { isValid: true, data: tensor };
}

/**
 * Validates output probability distribution from ONNX classification session.
 * Softmax invariants:
 * - Each probability must be in [0.0, 1.0]
 * - Total sum must approximate 1.0 within numerical epsilon (±0.01)
 */
export function validateSoftmaxDistribution(probabilities: Float32Array | number[]): ValidationResult<number[]> {
  const errors: ValidationError[] = [];
  const probs = Array.from(probabilities);

  if (probs.length === 0) {
    return {
      isValid: false,
      errors: [{ code: 'INVALID_TENSOR_SHAPE', message: 'Probability distribution is empty.' }]
    };
  }

  let sum = 0;
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i];
    if (typeof p !== 'number' || !Number.isFinite(p)) {
      errors.push({
        code: 'NAN_OR_INF_DETECTED',
        message: `Softmax output at index ${i} is not finite.`,
        details: { index: i, value: p }
      });
      continue;
    }

    if (p < -1e-4 || p > 1.0 + 1e-4) {
      errors.push({
        code: 'PROBABILITY_SUM_INVALID',
        message: `Softmax value ${p} outside valid range [0, 1].`,
        details: { index: i, value: p }
      });
    }
    sum += p;
  }

  if (Math.abs(sum - 1.0) > 0.05) {
    errors.push({
      code: 'PROBABILITY_SUM_INVALID',
      message: `Softmax probability sum ${sum.toFixed(4)} diverges from 1.0 by more than 5%.`,
      details: { sum }
    });
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, data: probs };
}

/**
 * Runtime type guard verifying InferenceResult object integrity.
 */
export function isInferenceResult(obj: unknown): obj is InferenceResult {
  if (!obj || typeof obj !== 'object') return false;
  const res = obj as Record<string, unknown>;

  if (typeof res.latencyMs !== 'number' || !Number.isFinite(res.latencyMs) || res.latencyMs < 0) {
    return false;
  }

  if (!res.topPrediction || typeof res.topPrediction !== 'object') return false;
  const top = res.topPrediction as Record<string, unknown>;
  if (typeof top.label !== 'string' || typeof top.probability !== 'number') return false;

  if (!Array.isArray(res.topK)) return false;
  for (const item of res.topK) {
    if (!item || typeof item !== 'object') return false;
    const pred = item as Record<string, unknown>;
    if (typeof pred.label !== 'string' || typeof pred.probability !== 'number') return false;
  }

  if (!(res.normalizedTensor instanceof Float32Array)) return false;

  return true;
}

/**
 * Runtime validator for client-side session configurations.
 */
export function validateSessionConfig(config: unknown): ValidationResult<OnnxSessionConfig> {
  const errors: ValidationError[] = [];

  if (!config || typeof config !== 'object') {
    return {
      isValid: false,
      errors: [{ code: 'PROVIDER_UNAVAILABLE', message: 'Session config must be a non-null object.' }]
    };
  }

  const cfg = config as Record<string, unknown>;

  if (typeof cfg.modelPath !== 'string' || cfg.modelPath.trim().length === 0) {
    errors.push({
      code: 'PROVIDER_UNAVAILABLE',
      message: 'modelPath must be a non-empty string URL or relative path.'
    });
  }

  const validProviders = ['webgl', 'wasm', 'webgpu'];
  if (typeof cfg.executionProvider !== 'string' || !validProviders.includes(cfg.executionProvider)) {
    errors.push({
      code: 'PROVIDER_UNAVAILABLE',
      message: `executionProvider must be one of: ${validProviders.join(', ')}.`
    });
  }

  if (cfg.confidenceThreshold !== undefined) {
    if (
      typeof cfg.confidenceThreshold !== 'number' ||
      !Number.isFinite(cfg.confidenceThreshold) ||
      cfg.confidenceThreshold < 0 ||
      cfg.confidenceThreshold > 1
    ) {
      errors.push({
        code: 'PROBABILITY_SUM_INVALID',
        message: 'confidenceThreshold must be a finite number between 0.0 and 1.0.'
      });
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, data: config as OnnxSessionConfig };
}
