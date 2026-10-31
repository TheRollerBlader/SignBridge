import { describe, it, expect } from 'vitest';
import {
  computeLandmarkBoundingBox,
  normalizeLandmarkTensor,
  computeSoftmax,
  extractTopK,
  ASL_ALPHABET_LABELS
} from '../lib/onnxInferenceTypes';
import type { Landmark3D } from '../lib/gestureSmoothing';

describe('ONNX Inference Types and Tensor Normalization', () => {
  const createMockHandLandmarks = (): Landmark3D[] => {
    const landmarks: Landmark3D[] = [];
    for (let i = 0; i < 21; i++) {
      landmarks.push({
        x: 0.5 + i * 0.01,
        y: 0.5 + i * 0.02,
        z: 0.0 + i * 0.005
      });
    }
    return landmarks;
  };

  it('computes bounding box with correct dimensions and bounds', () => {
    const landmarks = createMockHandLandmarks();
    const bbox = computeLandmarkBoundingBox(landmarks);

    expect(bbox.xMin).toBeCloseTo(0.5, 4);
    expect(bbox.xMax).toBeCloseTo(0.7, 4);
    expect(bbox.width).toBeCloseTo(0.2, 4);
    expect(bbox.height).toBeGreaterThan(0);
  });

  it('handles empty landmark arrays gracefully for bounding box', () => {
    const bbox = computeLandmarkBoundingBox([]);
    expect(bbox.width).toBe(0);
    expect(bbox.height).toBe(0);
  });

  it('normalizes wrist relative coordinates to origin (0,0,0)', () => {
    const landmarks = createMockHandLandmarks();
    const tensor = normalizeLandmarkTensor(landmarks);

    expect(tensor.length).toBe(63); // 21 keypoints * 3 coordinates
    // Wrist (Landmark 0) must be (0, 0, 0)
    expect(tensor[0]).toBeCloseTo(0, 5);
    expect(tensor[1]).toBeCloseTo(0, 5);
    expect(tensor[2]).toBeCloseTo(0, 5);
  });

  it('preserves invariant palm scale for varying hand distances', () => {
    const hand1 = createMockHandLandmarks();
    // Simulate moving hand further from camera (scale shrunk by 2)
    const hand2 = hand1.map(pt => ({
      x: pt.x * 0.5,
      y: pt.y * 0.5,
      z: pt.z * 0.5
    }));

    const tensor1 = normalizeLandmarkTensor(hand1);
    const tensor2 = normalizeLandmarkTensor(hand2);

    // After scale invariance normalization, keypoints must match within float precision
    for (let i = 0; i < 63; i++) {
      expect(tensor1[i]).toBeCloseTo(tensor2[i], 4);
    }
  });

  it('computes normalized softmax probabilities summing to 1.0', () => {
    const logits = [2.0, 1.0, 0.1, -1.5];
    const probs = computeSoftmax(logits);

    expect(probs.length).toBe(4);
    expect(probs[0]).toBeGreaterThan(probs[1]);
    expect(probs[1]).toBeGreaterThan(probs[2]);

    const sum = probs.reduce((acc, p) => acc + p, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('extracts top-K predictions accurately according to probability rank', () => {
    const probs = new Float32Array(ASL_ALPHABET_LABELS.length);
    // Give label 'C' (index 2) highest probability and 'A' (index 0) second highest
    probs[2] = 0.75;
    probs[0] = 0.20;
    probs[1] = 0.05;

    const topK = extractTopK(probs, ASL_ALPHABET_LABELS, 2);
    expect(topK.length).toBe(2);
    expect(topK[0].label).toBe('C');
    expect(topK[0].probability).toBeCloseTo(0.75, 4);
    expect(topK[1].label).toBe('A');
    expect(topK[1].probability).toBeCloseTo(0.20, 4);
  });
});
