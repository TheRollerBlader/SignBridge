import { describe, it, expect, beforeEach } from 'vitest';
import {
  TemporalLandmarkSmoother,
  type Landmark3D,
} from '../lib/gestureSmoothing';

describe('TemporalLandmarkSmoother', () => {
  let smoother: TemporalLandmarkSmoother;

  beforeEach(() => {
    smoother = new TemporalLandmarkSmoother({
      alpha: 0.5,
      maxJumpThreshold: 0.2,
      windowSize: 5,
      confidenceThreshold: 0.7,
    });
  });

  describe('Landmark Spatial Smoothing', () => {
    it('returns the raw landmarks as-is on the very first frame', () => {
      const initial: Landmark3D[] = [
        { x: 0.5, y: 0.5, z: 0.0 },
        { x: 0.6, y: 0.7, z: -0.1 },
      ];

      const result = smoother.smoothLandmarks(initial);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ x: 0.5, y: 0.5, z: 0.0 });
      expect(result[1]).toEqual({ x: 0.6, y: 0.7, z: -0.1 });
    });

    it('smooths consecutive frames using exponential moving average (alpha=0.5)', () => {
      const f1: Landmark3D[] = [{ x: 0.0, y: 0.0, z: 0.0 }];
      const f2: Landmark3D[] = [{ x: 0.1, y: 0.1, z: 0.0 }];

      smoother.smoothLandmarks(f1);
      const smoothed = smoother.smoothLandmarks(f2);

      // (0.0 * 0.5) + (0.1 * 0.5) = 0.05
      expect(smoothed[0].x).toBeCloseTo(0.05, 4);
      expect(smoothed[0].y).toBeCloseTo(0.05, 4);
    });

    it('clamps outlier jumps that exceed maxJumpThreshold', () => {
      const f1: Landmark3D[] = [{ x: 0.0, y: 0.0, z: 0.0 }];
      // Sudden teleport of 1.0 units (max threshold is 0.2)
      const f2: Landmark3D[] = [{ x: 1.0, y: 0.0, z: 0.0 }];

      smoother.smoothLandmarks(f1);
      const smoothed = smoother.smoothLandmarks(f2);

      // Clamped delta = 0.2 -> EMA target is 0.2 -> smoothed value = 0.0*0.5 + 0.2*0.5 = 0.1
      expect(smoothed[0].x).toBeCloseTo(0.1, 4);
    });

    it('handles empty landmark inputs gracefully', () => {
      expect(smoother.smoothLandmarks([])).toEqual([]);
    });
  });

  describe('Prediction Token Majority Stabilization', () => {
    it('rejects predictions below the confidence threshold', () => {
      const token = smoother.stabilizePrediction('A', 0.5); // threshold is 0.7
      expect(token).toBeNull();
    });

    it('stabilizes predictions once majority vote is reached', () => {
      // 5 frame window -> requires 3 votes
      expect(smoother.stabilizePrediction('B', 0.9)).toBeNull();
      expect(smoother.stabilizePrediction('B', 0.95)).toBeNull();
      expect(smoother.stabilizePrediction('B', 0.88)).toBe('B'); // 3rd vote reaches majority!
    });

    it('prevents transient single-frame flicker from corrupting stable output', () => {
      smoother.stabilizePrediction('C', 0.9);
      smoother.stabilizePrediction('C', 0.9);
      smoother.stabilizePrediction('C', 0.9); // Stable 'C'

      // Transient single-frame noise
      const noisyToken = smoother.stabilizePrediction('D', 0.9);
      expect(noisyToken).toBe('C'); // 'C' remains majority (3 vs 1)
    });

    it('clears history on reset()', () => {
      smoother.stabilizePrediction('E', 0.9);
      smoother.stabilizePrediction('E', 0.9);
      smoother.reset();

      // After reset, should need 3 new votes
      expect(smoother.stabilizePrediction('E', 0.9)).toBeNull();
    });
  });
});
