import { describe, it, expect } from 'vitest';
import type { Landmark3D } from '../lib/gestureSmoothing';
import {
  analyzeHandKinematics,
  computeJointAngleDeg,
  computePalmBasis,
  extractFingerKinematics,
  extractKinematicFeatureVector,
} from '../lib/handKinematics';

function buildOpenHandLandmarks(scale = 1.0, offsetX = 0, offsetY = 0): Landmark3D[] {
  const base: Array<[number, number, number]> = [
    [0.0, 0.0, 0.0], // 0: wrist
    [-0.08, -0.05, 0.0], // 1: thumb CMC
    [-0.14, -0.11, 0.0], // 2: thumb MCP
    [-0.19, -0.17, 0.0], // 3: thumb IP
    [-0.24, -0.23, 0.0], // 4: thumb tip
    [-0.06, -0.18, 0.0], // 5: index MCP
    [-0.07, -0.27, 0.0], // 6: index PIP
    [-0.075, -0.34, 0.0], // 7: index DIP
    [-0.08, -0.41, 0.0], // 8: index tip
    [0.0, -0.20, 0.0], // 9: middle MCP
    [0.0, -0.30, 0.0], // 10: middle PIP
    [0.0, -0.38, 0.0], // 11: middle DIP
    [0.0, -0.45, 0.0], // 12: middle tip
    [0.06, -0.18, 0.0], // 13: ring MCP
    [0.07, -0.27, 0.0], // 14: ring PIP
    [0.075, -0.34, 0.0], // 15: ring DIP
    [0.08, -0.40, 0.0], // 16: ring tip
    [0.12, -0.15, 0.0], // 17: pinky MCP
    [0.14, -0.22, 0.0], // 18: pinky PIP
    [0.15, -0.28, 0.0], // 19: pinky DIP
    [0.16, -0.33, 0.0], // 20: pinky tip
  ];

  return base.map(([x, y, z]) => ({
    x: x * scale + offsetX,
    y: y * scale + offsetY,
    z: z * scale,
  }));
}

function buildClosedFistLandmarks(): Landmark3D[] {
  const hand = buildOpenHandLandmarks();
  // Curl index..pinky tips back toward the palm/MCP
  hand[6] = { x: -0.06, y: -0.24, z: -0.04 };
  hand[7] = { x: -0.06, y: -0.18, z: -0.07 };
  hand[8] = { x: -0.05, y: -0.12, z: -0.05 };

  hand[10] = { x: 0.0, y: -0.26, z: -0.04 };
  hand[11] = { x: 0.0, y: -0.19, z: -0.07 };
  hand[12] = { x: 0.0, y: -0.12, z: -0.05 };

  hand[14] = { x: 0.06, y: -0.24, z: -0.04 };
  hand[15] = { x: 0.06, y: -0.17, z: -0.07 };
  hand[16] = { x: 0.05, y: -0.11, z: -0.05 };

  hand[18] = { x: 0.12, y: -0.20, z: -0.04 };
  hand[19] = { x: 0.12, y: -0.15, z: -0.06 };
  hand[20] = { x: 0.11, y: -0.10, z: -0.04 };
  return hand;
}

describe('handKinematics', () => {
  it('computes exact joint angles for collinear and orthogonal segments', () => {
    const a: Landmark3D = { x: 0, y: 1, z: 0 };
    const b: Landmark3D = { x: 0, y: 0, z: 0 };
    const cRight: Landmark3D = { x: 1, y: 0, z: 0 };
    const cStraight: Landmark3D = { x: 0, y: -1, z: 0 };

    expect(computeJointAngleDeg(a, b, cRight)).toBeCloseTo(90, 4);
    expect(computeJointAngleDeg(a, b, cStraight)).toBeCloseTo(180, 4);
  });

  it('constructs an orthonormal palm basis', () => {
    const hand = buildOpenHandLandmarks();
    const basis = computePalmBasis(hand);

    expect(basis.palmSpan).toBeCloseTo(0.2, 4);
    const dotUpAcross =
      basis.up.x * basis.across.x + basis.up.y * basis.across.y + basis.up.z * basis.across.z;
    const dotUpNormal =
      basis.up.x * basis.normal.x + basis.up.y * basis.normal.y + basis.up.z * basis.normal.z;
    expect(dotUpAcross).toBeCloseTo(0, 5);
    expect(dotUpNormal).toBeCloseTo(0, 5);
    expect(Math.abs(basis.normal.z)).toBeCloseTo(1, 3);
  });

  it('distinguishes open hand fingers from curled fist fingers', () => {
    const open = extractFingerKinematics(buildOpenHandLandmarks());
    const fist = extractFingerKinematics(buildClosedFistLandmarks());

    expect(open.index.isExtended).toBe(true);
    expect(open.middle.isExtended).toBe(true);
    expect(open.pinky.isExtended).toBe(true);
    expect(open.index.pipAngleDeg).toBeGreaterThan(165);

    expect(fist.index.isExtended).toBe(false);
    expect(fist.middle.isExtended).toBe(false);
    expect(fist.ring.isExtended).toBe(false);
    expect(fist.index.pipAngleDeg).toBeLessThan(110);
  });

  it('produces scale- and translation-invariant 19-element kinematic vectors', () => {
    const ref = analyzeHandKinematics(buildOpenHandLandmarks(1.0, 0, 0));
    const transformed = analyzeHandKinematics(buildOpenHandLandmarks(2.5, 0.4, -0.3));

    expect(ref.featureVector).toHaveLength(19);
    for (let i = 0; i < ref.featureVector.length; i++) {
      expect(transformed.featureVector[i]).toBeCloseTo(ref.featureVector[i], 4);
    }
  });

  it('detects pinch contact when thumb tip meets index tip', () => {
    const hand = buildOpenHandLandmarks();
    hand[4] = { ...hand[8] }; // Touch thumb tip to index tip
    const summary = analyzeHandKinematics(hand);

    expect(summary.pinchDistances.index).toBeCloseTo(0, 5);
    expect(summary.pinchDistances.pinky).toBeGreaterThan(0.5);
  });

  it('handles incomplete landmarks safely in extractKinematicFeatureVector', () => {
    const emptyVec = extractKinematicFeatureVector([]);
    expect(emptyVec).toHaveLength(19);
    expect(Array.from(emptyVec).every(v => v === 0)).toBe(true);
    expect(() => computePalmBasis([])).toThrow(RangeError);
  });
});
