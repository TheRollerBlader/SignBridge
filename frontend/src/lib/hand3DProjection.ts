/**
 * 3D Hand Landmark Projection & Spatial Mathematics Engine for SignBridge.
 *
 * Provides real-time 3D coordinate transformations, perspective camera projections,
 * anatomical bone graph topology, and spatial confidence vector computations
 * for MediaPipe 21-point hand landmarks.
 */

import type { Landmark3D } from './gestureSmoothing';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface ProjectedPoint2D {
  x: number;
  y: number;
  depth: number;
  scale: number;
  landmarkIndex: number;
  confidence: number;
}

export interface SpatialConfidenceVector {
  startIndex: number;
  endIndex: number;
  startPoint: ProjectedPoint2D;
  endPoint: ProjectedPoint2D;
  vector: Vector3D;
  magnitude: number;
  confidence: number;
  label: string;
}

export interface CameraOrbit {
  yaw: number; // Horizontal rotation angle in radians
  pitch: number; // Vertical rotation angle in radians
  zoom: number; // Scaling factor
  distance: number; // Perspective distance (focal length)
}

export const DEFAULT_CAMERA_ORBIT: CameraOrbit = {
  yaw: 0.0,
  pitch: 0.0,
  zoom: 350.0,
  distance: 1.5,
};

/**
 * Standard anatomical bone connectivity for the 21 MediaPipe hand landmarks.
 * [parentIndex, childIndex]
 */
export const HAND_BONE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // Thumb
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  // Index finger
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  // Middle finger
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  // Ring finger
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  // Pinky finger
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  // Palm transverse arch
  [5, 9],
  [9, 13],
  [13, 17],
];

export const FINGERTIP_INDICES: readonly number[] = [4, 8, 12, 16, 20];
export const FINGER_NAMES: readonly string[] = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

/**
 * Computes 3D centroid of landmark cloud.
 */
export function computeCentroid(landmarks: readonly Landmark3D[]): Vector3D {
  if (landmarks.length === 0) return { x: 0, y: 0, z: 0 };
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  for (let i = 0; i < landmarks.length; i++) {
    sumX += landmarks[i].x;
    sumY += landmarks[i].y;
    sumZ += landmarks[i].z ?? 0;
  }
  const n = landmarks.length;
  return { x: sumX / n, y: sumY / n, z: sumZ / n };
}

/**
 * Rotates a 3D point around origin using yaw (Y-axis) and pitch (X-axis).
 */
export function rotatePoint3D(point: Vector3D, yaw: number, pitch: number): Vector3D {
  // Pitch rotation around X axis
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const y1 = point.y * cosP - point.z * sinP;
  const z1 = point.y * sinP + point.z * cosP;

  // Yaw rotation around Y axis
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x2 = point.x * cosY + z1 * sinY;
  const z2 = -point.x * sinY + z1 * cosY;

  return { x: x2, y: y1, z: z2 };
}

/**
 * Projects 3D landmarks onto a 2D canvas viewport using perspective projection.
 */
export function projectLandmarks3D(
  landmarks: readonly Landmark3D[],
  viewportWidth: number,
  viewportHeight: number,
  camera: CameraOrbit = DEFAULT_CAMERA_ORBIT
): ProjectedPoint2D[] {
  if (landmarks.length === 0) return [];

  const centroid = computeCentroid(landmarks);
  const cx = viewportWidth / 2;
  const cy = viewportHeight / 2;

  const projected: ProjectedPoint2D[] = [];

  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    // Center coordinates relative to hand centroid
    const centered: Vector3D = {
      x: lm.x - centroid.x,
      y: lm.y - centroid.y,
      z: (lm.z ?? 0) - centroid.z,
    };

    const rotated = rotatePoint3D(centered, camera.yaw, camera.pitch);

    // Perspective foreshortening
    const depthZ = rotated.z;
    const depthScale = Math.max(0.1, camera.distance / (camera.distance + depthZ));

    const screenX = cx + rotated.x * camera.zoom * depthScale;
    const screenY = cy + rotated.y * camera.zoom * depthScale;

    projected.push({
      x: screenX,
      y: screenY,
      depth: depthZ,
      scale: depthScale,
      landmarkIndex: i,
      confidence: lm.visibility ?? 1.0,
    });
  }

  return projected;
}

/**
 * Computes the 3D unit normal vector representing palm orientation.
 * Normal is the cross product of (Wrist -> Middle MCP) and (Index MCP -> Pinky MCP).
 */
export function computePalmNormal(landmarks: readonly Landmark3D[]): Vector3D {
  if (landmarks.length < 21) {
    return { x: 0, y: 0, z: 1 };
  }

  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const pinkyMcp = landmarks[17];

  // Longitudinal vector (Wrist to Middle MCP)
  const vLong: Vector3D = {
    x: middleMcp.x - wrist.x,
    y: middleMcp.y - wrist.y,
    z: (middleMcp.z ?? 0) - (wrist.z ?? 0),
  };

  // Transverse vector (Index MCP to Pinky MCP)
  const vTrans: Vector3D = {
    x: pinkyMcp.x - indexMcp.x,
    y: pinkyMcp.y - indexMcp.y,
    z: (pinkyMcp.z ?? 0) - (indexMcp.z ?? 0),
  };

  // Cross product: vLong x vTrans
  const nx = vLong.y * vTrans.z - vLong.z * vTrans.y;
  const ny = vLong.z * vTrans.x - vLong.x * vTrans.z;
  const nz = vLong.x * vTrans.y - vLong.y * vTrans.x;

  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-6) {
    return { x: 0, y: 0, z: 1 };
  }

  return { x: nx / len, y: ny / len, z: nz / len };
}

/**
 * Calculates live spatial confidence and pointing direction vectors for all 5 fingertips.
 */
export function computeSpatialConfidenceVectors(
  landmarks: readonly Landmark3D[],
  projected: readonly ProjectedPoint2D[]
): SpatialConfidenceVector[] {
  if (landmarks.length < 21 || projected.length < 21) return [];

  // Tip to preceding joint pairs:
  // Thumb: 3 -> 4, Index: 7 -> 8, Middle: 11 -> 12, Ring: 15 -> 16, Pinky: 19 -> 20
  const pairs: Array<[number, number, string]> = [
    [3, 4, 'Thumb Vector'],
    [7, 8, 'Index Vector'],
    [11, 12, 'Middle Vector'],
    [15, 16, 'Ring Vector'],
    [19, 20, 'Pinky Vector'],
  ];

  const vectors: SpatialConfidenceVector[] = [];

  for (const [startIdx, endIdx, label] of pairs) {
    const p1 = landmarks[startIdx];
    const p2 = landmarks[endIdx];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = (p2.z ?? 0) - (p1.z ?? 0);
    const mag = Math.hypot(dx, dy, dz);

    const conf1 = landmarks[startIdx].visibility ?? 1.0;
    const conf2 = landmarks[endIdx].visibility ?? 1.0;
    const combinedConf = (conf1 + conf2) / 2;

    vectors.push({
      startIndex: startIdx,
      endIndex: endIdx,
      startPoint: projected[startIdx],
      endPoint: projected[endIdx],
      vector: { x: dx, y: dy, z: dz },
      magnitude: mag,
      confidence: combinedConf,
      label,
    });
  }

  return vectors;
}
