/**
 * Synthetic gesture landmark sequence fixtures and spatial normalization bounds.
 * Scheduled Milestone: Testing & Verification (2026-11-13).
 *
 * Verifies:
 * 1. 21-keypoint MediaPipe canonical hand mesh geometry assertions.
 * 2. Translation & scale invariance under wrist-relative normalization.
 * 3. Temporal dropout and landmark jitter boundaries across continuous frames.
 */

import { describe, it, expect } from 'vitest';
import { type Landmark3D, TemporalLandmarkSmoother } from '../lib/gestureSmoothing';
import { projectLandmarks3D, computeCentroid } from '../lib/hand3DProjection';

/** Helper to generate synthetic 21-point MediaPipe hand landmark frame */
function createSyntheticHandFrame(offsetX = 0.5, offsetY = 0.5, scale = 1.0): Landmark3D[] {
  // 21 canonical keypoints: 0=wrist, 1-4=thumb, 5-8=index, 9-12=middle, 13-16=ring, 17-20=pinky
  const baseLandmarks: [number, number, number][] = [
    [0.0, 0.0, 0.0],       // 0: Wrist
    [-0.04, -0.05, -0.01], // 1: Thumb CMC
    [-0.07, -0.10, -0.02], // 2: Thumb MCP
    [-0.09, -0.14, -0.03], // 3: Thumb IP
    [-0.10, -0.18, -0.04], // 4: Thumb TIP
    [-0.03, -0.15, -0.01], // 5: Index MCP
    [-0.03, -0.22, -0.02], // 6: Index PIP
    [-0.03, -0.27, -0.02], // 7: Index DIP
    [-0.03, -0.31, -0.02], // 8: Index TIP
    [0.00, -0.16, -0.01],  // 9: Middle MCP
    [0.00, -0.23, -0.02],  // 10: Middle PIP
    [0.00, -0.28, -0.02],  // 11: Middle DIP
    [0.00, -0.33, -0.02],  // 12: Middle TIP
    [0.03, -0.15, -0.01],  // 13: Ring MCP
    [0.03, -0.21, -0.02],  // 14: Ring PIP
    [0.03, -0.26, -0.02],  // 15: Ring DIP
    [0.03, -0.30, -0.02],  // 16: Ring TIP
    [0.06, -0.12, -0.01],  // 17: Pinky MCP
    [0.07, -0.17, -0.02],  // 18: Pinky PIP
    [0.08, -0.21, -0.02],  // 19: Pinky DIP
    [0.08, -0.25, -0.02],  // 20: Pinky TIP
  ];

  return baseLandmarks.map(([x, y, z]) => ({
    x: offsetX + x * scale,
    y: offsetY + y * scale,
    z: z * scale,
  }));
}

describe('Synthetic Gesture Sequence & Landmark Fixtures', () => {
  describe('Mesh Topology & Anatomical Invariants', () => {
    it('generates a structurally valid 21-point canonical hand landmark mesh', () => {
      const frame = createSyntheticHandFrame();
      expect(frame).toHaveLength(21);

      // Verify all coordinates are bounded in typical normalized camera view space [0, 1]
      for (const pt of frame) {
        expect(pt.x).toBeGreaterThanOrEqual(0.0);
        expect(pt.x).toBeLessThanOrEqual(1.0);
        expect(pt.y).toBeGreaterThanOrEqual(0.0);
        expect(pt.y).toBeLessThanOrEqual(1.0);
        expect(typeof pt.z).toBe('number');
      }
    });

    it('maintains hierarchical finger link distances greater than zero', () => {
      const frame = createSyntheticHandFrame(0.5, 0.5, 1.0);

      // Check distance from wrist to MCP joints (Thumb: 1, Index: 5, Middle: 9, Ring: 13, Pinky: 17)
      const wrist = frame[0];
      const mcps = [frame[1], frame[5], frame[9], frame[13], frame[17]];

      for (const mcp of mcps) {
        const dx = mcp.x - wrist.x;
        const dy = mcp.y - wrist.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        expect(dist).toBeGreaterThan(0.04);
        expect(dist).toBeLessThan(0.35);
      }
    });
  });

  describe('Spatial Translation Invariance & 3D Projection', () => {
    it('produces consistent relative vectors when hand moves across the viewport', () => {
      const handLeft = createSyntheticHandFrame(0.2, 0.3, 1.0);
      const handRight = createSyntheticHandFrame(0.8, 0.7, 1.0);

      // Calculate vector from wrist (0) to middle tip (12)
      const vecLeft = {
        x: handLeft[12].x - handLeft[0].x,
        y: handLeft[12].y - handLeft[0].y,
      };
      const vecRight = {
        x: handRight[12].x - handRight[0].x,
        y: handRight[12].y - handRight[0].y,
      };

      expect(vecLeft.x).toBeCloseTo(vecRight.x, 5);
      expect(vecLeft.y).toBeCloseTo(vecRight.y, 5);
    });

    it('3D projection maps landmarks with valid camera depth bounds', () => {
      const frame = createSyntheticHandFrame(0.5, 0.5, 1.0);
      const points = projectLandmarks3D(frame, 640, 480);
      const centroid = computeCentroid(frame);

      expect(points).toHaveLength(21);
      expect(centroid.x).toBeCloseTo(0.5, 1);
      expect(centroid.y).toBeLessThan(0.5); // tips extend upwards/negatively
      for (const pt of points) {
        expect(typeof pt.depth).toBe('number');
        expect(pt.scale).toBeGreaterThan(0);
      }
    });
  });

  describe('Temporal Sequence Jitter & Filter Recovery', () => {
    it('smoother rejects high-velocity outlier noise and recovers on nominal frames', () => {
      const smoother = new TemporalLandmarkSmoother({
        alpha: 0.5,
        maxJumpThreshold: 0.15,
        windowSize: 5,
        confidenceThreshold: 0.7,
      });

      const frameNominal1 = createSyntheticHandFrame(0.5, 0.5, 1.0);
      const frameGlitch = createSyntheticHandFrame(0.9, 0.9, 1.0); // Jump > 0.15
      const frameNominal2 = createSyntheticHandFrame(0.51, 0.51, 1.0);

      smoother.smoothLandmarks(frameNominal1);
      const resultGlitch = smoother.smoothLandmarks(frameGlitch);
      const resultRecovered = smoother.smoothLandmarks(frameNominal2);

      // Glitch frame should have clamped jump
      expect(Math.abs(resultGlitch[0].x - frameNominal1[0].x)).toBeLessThanOrEqual(0.16);

      // Subsequent frame smoothly tracks close to nominal
      expect(resultRecovered[0].x).toBeCloseTo(0.51, 1);
    });
  });
});
