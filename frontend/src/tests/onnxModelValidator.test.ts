import { describe, expect, it } from 'vitest';
import {
  isInferenceResult,
  validateHandLandmarks,
  validateInferenceTensor,
  validateSessionConfig,
  validateSoftmaxDistribution,
} from '../lib/onnxModelValidator';
import type { Landmark3D } from '../lib/gestureSmoothing';

describe('SignBridge Runtime ONNX Model Validator & Type Guards', () => {
  describe('validateHandLandmarks', () => {
    it('accepts a valid 21-landmark MediaPipe topology array', () => {
      const validLandmarks: Landmark3D[] = Array.from({ length: 21 }, (_, i) => ({
        x: 0.5 + i * 0.01,
        y: 0.4 + i * 0.01,
        z: -0.1 + i * 0.005,
      }));

      const result = validateHandLandmarks(validLandmarks);
      expect(result.isValid).toBe(true);
      if (result.isValid) {
        expect(result.data.length).toBe(21);
      }
    });

    it('rejects landmark arrays with length !== 21', () => {
      const incomplete = Array.from({ length: 15 }, () => ({ x: 0, y: 0, z: 0 }));
      const result = validateHandLandmarks(incomplete);
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errors[0].code).toBe('INVALID_TENSOR_SHAPE');
      }
    });

    it('detects NaN or infinite coordinates in landmarks', () => {
      const tainted: Landmark3D[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
      tainted[4] = { x: NaN, y: 0.5, z: 0.1 };
      tainted[8] = { x: 0.2, y: Infinity, z: 0.1 };

      const result = validateHandLandmarks(tainted);
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
        expect(result.errors.some((e) => e.code === 'NAN_OR_INF_DETECTED')).toBe(true);
      }
    });
  });

  describe('validateInferenceTensor', () => {
    it('accepts valid 63-element Float32Array', () => {
      const tensor = new Float32Array(63);
      tensor.fill(0.123);
      const result = validateInferenceTensor(tensor);
      expect(result.isValid).toBe(true);
    });

    it('rejects non-Float32Array inputs', () => {
      const standardArray = new Array(63).fill(0.1);
      const result = validateInferenceTensor(standardArray);
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errors[0].code).toBe('INVALID_TENSOR_SHAPE');
      }
    });

    it('rejects tensors of incorrect length', () => {
      const shortTensor = new Float32Array(42);
      const result = validateInferenceTensor(shortTensor);
      expect(result.isValid).toBe(false);
    });

    it('rejects tensors containing NaN elements', () => {
      const tensor = new Float32Array(63);
      tensor[10] = NaN;
      const result = validateInferenceTensor(tensor);
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errors[0].code).toBe('NAN_OR_INF_DETECTED');
      }
    });
  });

  describe('validateSoftmaxDistribution', () => {
    it('validates a correct probability distribution summing to 1.0', () => {
      const probs = [0.7, 0.2, 0.05, 0.05];
      const result = validateSoftmaxDistribution(probs);
      expect(result.isValid).toBe(true);
    });

    it('rejects distributions where sum diverges from 1.0', () => {
      const unnormalized = [0.8, 0.5, 0.4];
      const result = validateSoftmaxDistribution(unnormalized);
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errors.some((e) => e.code === 'PROBABILITY_SUM_INVALID')).toBe(true);
      }
    });

    it('rejects negative probability values', () => {
      const negative = [-0.1, 0.9, 0.2];
      const result = validateSoftmaxDistribution(negative);
      expect(result.isValid).toBe(false);
    });
  });

  describe('isInferenceResult type guard', () => {
    it('returns true for well-formed inference output', () => {
      const valid = {
        topPrediction: { label: 'A', probability: 0.94 },
        topK: [
          { label: 'A', probability: 0.94 },
          { label: 'E', probability: 0.04 },
        ],
        latencyMs: 14.2,
        normalizedTensor: new Float32Array(63),
        wristRelativeSpan: 1.12,
      };
      expect(isInferenceResult(valid)).toBe(true);
    });

    it('returns false for malformed or missing fields', () => {
      expect(isInferenceResult(null)).toBe(false);
      expect(isInferenceResult({})).toBe(false);
      expect(isInferenceResult({ latencyMs: -5 })).toBe(false);
    });
  });

  describe('validateSessionConfig', () => {
    it('accepts valid session configuration', () => {
      const config = {
        modelPath: '/models/wlasl_fp16.onnx',
        executionProvider: 'webgl' as const,
        confidenceThreshold: 0.85,
      };
      const result = validateSessionConfig(config);
      expect(result.isValid).toBe(true);
    });

    it('rejects invalid execution providers', () => {
      const config = {
        modelPath: '/models/wlasl_fp16.onnx',
        executionProvider: 'cuda', // Not available in browser
      };
      const result = validateSessionConfig(config);
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errors[0].code).toBe('PROVIDER_UNAVAILABLE');
      }
    });

    it('rejects out-of-range confidence thresholds', () => {
      const config = {
        modelPath: '/models/wlasl.onnx',
        executionProvider: 'wasm' as const,
        confidenceThreshold: 1.5,
      };
      const result = validateSessionConfig(config);
      expect(result.isValid).toBe(false);
    });
  });
});
