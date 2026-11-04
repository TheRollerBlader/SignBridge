import { describe, it, expect } from 'vitest';
import {
  computeCentroid,
  rotatePoint3D,
  projectLandmarks3D,
  computePalmNormal,
  computeSpatialConfidenceVectors,
  HAND_BONE_CONNECTIONS,
  DEFAULT_CAMERA_ORBIT,
  type Vector3D
} from '../lib/hand3DProjection';
import type { Landmark3D } from '../lib/gestureSmoothing';

describe('3D Hand Projection and Spatial Vector Engine', () => {
  const createMock3DHand = (): Landmark3D[] => {
    const landmarks: Landmark3D[] = [];
    for (let i = 0; i < 21; i++) {
      landmarks.push({
        x: 0.5 + (i % 5) * 0.05,
        y: 0.5 + Math.floor(i / 5) * 0.08,
        z: (i % 3) * 0.02,
        visibility: 0.95
      });
    }
    return landmarks;
  };

  it('computes 3D centroid accurately and handles empty arrays', () => {
    expect(computeCentroid([])).toEqual({ x: 0, y: 0, z: 0 });

    const points: Landmark3D[] = [
      { x: 1.0, y: 2.0, z: 3.0 },
      { x: 3.0, y: 4.0, z: 5.0 }
    ];
    const centroid = computeCentroid(points);
    expect(centroid.x).toBeCloseTo(2.0);
    expect(centroid.y).toBeCloseTo(3.0);
    expect(centroid.z).toBeCloseTo(4.0);
  });

  it('preserves Euclidean length under 3D yaw and pitch rotation', () => {
    const pt: Vector3D = { x: 0.3, y: 0.4, z: 0.5 };
    const initialLen = Math.hypot(pt.x, pt.y, pt.z);

    const rotated = rotatePoint3D(pt, Math.PI / 4, Math.PI / 6);
    const rotatedLen = Math.hypot(rotated.x, rotated.y, rotated.z);

    expect(rotatedLen).toBeCloseTo(initialLen, 5);
  });

  it('projects 21 landmarks with perspective depth scaling onto viewport', () => {
    const landmarks = createMock3DHand();
    const width = 640;
    const height = 480;

    const projected = projectLandmarks3D(landmarks, width, height, DEFAULT_CAMERA_ORBIT);

    expect(projected.length).toBe(21);
    for (const p of projected) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(height);
      expect(p.scale).toBeGreaterThan(0);
      expect(p.confidence).toBe(0.95);
    }
  });

  it('computes normalized palm normal vector perpendicular to palm plane', () => {
    const landmarks = createMock3DHand();
    // Set explicit coplanar positions for palm joints (wrist=0, index=5, middle=9, pinky=17)
    landmarks[0] = { x: 0.0, y: 0.0, z: 0.0 }; // Wrist
    landmarks[5] = { x: 0.1, y: 0.3, z: 0.0 }; // Index MCP
    landmarks[9] = { x: 0.0, y: 0.35, z: 0.0 }; // Middle MCP
    landmarks[17] = { x: -0.1, y: 0.28, z: 0.0 }; // Pinky MCP

    const normal = computePalmNormal(landmarks);

    // Magnitude must be unit length 1.0
    const mag = Math.hypot(normal.x, normal.y, normal.z);
    expect(mag).toBeCloseTo(1.0, 5);

    // For a palm in XY plane, normal must align along Z-axis (|z| ~ 1)
    expect(Math.abs(normal.z)).toBeCloseTo(1.0, 3);
  });

  it('computes 5 distinct spatial fingertip direction vectors', () => {
    const landmarks = createMock3DHand();
    const projected = projectLandmarks3D(landmarks, 640, 480);

    const vectors = computeSpatialConfidenceVectors(landmarks, projected);
    expect(vectors.length).toBe(5);

    const labels = vectors.map(v => v.label);
    expect(labels).toContain('Thumb Vector');
    expect(labels).toContain('Index Vector');
    expect(labels).toContain('Middle Vector');
    expect(labels).toContain('Ring Vector');
    expect(labels).toContain('Pinky Vector');

    for (const vec of vectors) {
      expect(vec.magnitude).toBeGreaterThan(0);
      expect(vec.confidence).toBeGreaterThan(0);
      expect(vec.startPoint).toBeDefined();
      expect(vec.endPoint).toBeDefined();
    }
  });

  it('verifies complete hand anatomical bone graph topology has no invalid indices', () => {
    // 20 finger bone segments + 3 transverse palm arch connections = 23 connections
    expect(HAND_BONE_CONNECTIONS.length).toBe(23);
    for (const [start, end] of HAND_BONE_CONNECTIONS) {
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThan(21);
      expect(end).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThan(21);
      expect(start).not.toBe(end);
    }
  });
});
