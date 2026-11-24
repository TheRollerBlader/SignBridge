/**
 * 3D Hand Kinematic Feature & Finger-Curl Angle Extractor for SignBridge.
 *
 * Derives scale- and translation-invariant geometric descriptors from 21 MediaPipe
 * hand landmarks (joint flexion angles, palm orthonormal basis, extension ratios,
 * and normalized thumb-pinch distances) to support client-side ASL inference.
 */

import type { Landmark3D } from './gestureSmoothing';
import type { Vector3D } from './hand3DProjection';

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

export interface PalmBasis {
  origin: Vector3D;
  across: Vector3D;
  up: Vector3D;
  normal: Vector3D;
  palmSpan: number;
}

export interface FingerKinematics {
  finger: FingerName;
  mcpAngleDeg: number;
  pipAngleDeg: number;
  dipAngleDeg: number;
  extensionRatio: number;
  isExtended: boolean;
}

export interface HandKinematicsSummary {
  palmBasis: PalmBasis;
  fingers: Record<FingerName, FingerKinematics>;
  pinchDistances: Record<Exclude<FingerName, 'thumb'>, number>;
  featureVector: Float32Array;
}

interface FingerJointChain {
  name: FingerName;
  indices: readonly [number, number, number, number];
}

const FINGER_CHAINS: readonly FingerJointChain[] = [
  { name: 'thumb', indices: [1, 2, 3, 4] },
  { name: 'index', indices: [5, 6, 7, 8] },
  { name: 'middle', indices: [9, 10, 11, 12] },
  { name: 'ring', indices: [13, 14, 15, 16] },
  { name: 'pinky', indices: [17, 18, 19, 20] },
];

const EXTENSION_THRESHOLD = 1.35;

function subtract(a: Landmark3D | Vector3D, b: Landmark3D | Vector3D): Vector3D {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: (a.z ?? 0) - (b.z ?? 0),
  };
}

function dot(a: Vector3D, b: Vector3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vector3D, b: Vector3D): Vector3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function magnitude(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalizeVec(v: Vector3D): Vector3D {
  const len = magnitude(v);
  if (len <= 1e-8) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Computes the interior angle (in degrees, [0, 180]) formed at vertex `b`
 * by segments `b -> a` and `b -> c`.
 */
export function computeJointAngleDeg(
  a: Landmark3D | Vector3D,
  b: Landmark3D | Vector3D,
  c: Landmark3D | Vector3D
): number {
  const ba = subtract(a, b);
  const bc = subtract(c, b);
  const denom = magnitude(ba) * magnitude(bc);
  if (denom <= 1e-8) {
    return 180;
  }
  const cosTheta = Math.min(1, Math.max(-1, dot(ba, bc) / denom));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

/**
 * Constructs an orthonormal coordinate frame anchored at the wrist (landmark 0)
 * using the wrist-to-middle-MCP axis (`up`) and index-to-pinky MCP span (`across`).
 */
export function computePalmBasis(landmarks: readonly Landmark3D[]): PalmBasis {
  if (landmarks.length !== 21) {
    throw new RangeError(`Expected 21 hand landmarks, received ${landmarks.length}`);
  }

  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const pinkyMcp = landmarks[17];

  const upRaw = subtract(middleMcp, wrist);
  const palmSpan = magnitude(upRaw) || 1.0;
  const up = normalizeVec(upRaw);

  const acrossRaw = subtract(pinkyMcp, indexMcp);
  const normal = normalizeVec(cross(up, acrossRaw));
  const across = normalizeVec(cross(normal, up));

  return {
    origin: { x: wrist.x, y: wrist.y, z: wrist.z ?? 0 },
    across,
    up,
    normal,
    palmSpan,
  };
}

/**
 * Extracts per-finger flexion angles and palm-normalized extension ratios.
 */
export function extractFingerKinematics(
  landmarks: readonly Landmark3D[],
  palmSpan?: number
): Record<FingerName, FingerKinematics> {
  if (landmarks.length !== 21) {
    throw new RangeError(`Expected 21 hand landmarks, received ${landmarks.length}`);
  }

  const wrist = landmarks[0];
  const span = palmSpan && palmSpan > 1e-8 ? palmSpan : computePalmBasis(landmarks).palmSpan;

  const result = {} as Record<FingerName, FingerKinematics>;

  for (const chain of FINGER_CHAINS) {
    const [j0, j1, j2, j3] = chain.indices;
    const mcpAngleDeg = computeJointAngleDeg(wrist, landmarks[j0], landmarks[j1]);
    const pipAngleDeg = computeJointAngleDeg(landmarks[j0], landmarks[j1], landmarks[j2]);
    const dipAngleDeg = computeJointAngleDeg(landmarks[j1], landmarks[j2], landmarks[j3]);

    const tipDist = magnitude(subtract(landmarks[j3], wrist));
    const extensionRatio = tipDist / span;
    const avgCurlAngle = (pipAngleDeg + dipAngleDeg) / 2;

    result[chain.name] = {
      finger: chain.name,
      mcpAngleDeg,
      pipAngleDeg,
      dipAngleDeg,
      extensionRatio,
      isExtended: extensionRatio >= EXTENSION_THRESHOLD && avgCurlAngle >= 130,
    };
  }

  return result;
}

/**
 * Computes full hand kinematics and a compact 19-element Float32Array feature vector
 * suitable for augmenting client-side ONNX fingerspelling classification:
 * - [0..4]: Finger extension ratios (clamped to [0, 3])
 * - [5..9]: Normalized PIP curl angles (pipAngleDeg / 180)
 * - [10..13]: Normalized thumb-tip to fingertip pinch distances
 * - [14..16]: Orthonormal palm normal vector (x, y, z)
 * - [17..18]: Index-to-middle and ring-to-pinky normalized fingertip spread
 */
export function analyzeHandKinematics(landmarks: readonly Landmark3D[]): HandKinematicsSummary {
  const palmBasis = computePalmBasis(landmarks);
  const fingers = extractFingerKinematics(landmarks, palmBasis.palmSpan);

  const thumbTip = landmarks[4];
  const pinchDistances: Record<Exclude<FingerName, 'thumb'>, number> = {
    index: magnitude(subtract(landmarks[8], thumbTip)) / palmBasis.palmSpan,
    middle: magnitude(subtract(landmarks[12], thumbTip)) / palmBasis.palmSpan,
    ring: magnitude(subtract(landmarks[16], thumbTip)) / palmBasis.palmSpan,
    pinky: magnitude(subtract(landmarks[20], thumbTip)) / palmBasis.palmSpan,
  };

  const featureVector = new Float32Array(19);
  const orderedFingers: readonly FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

  for (let i = 0; i < orderedFingers.length; i++) {
    const fk = fingers[orderedFingers[i]];
    featureVector[i] = Math.min(3, Math.max(0, fk.extensionRatio));
    featureVector[5 + i] = fk.pipAngleDeg / 180;
  }

  featureVector[10] = pinchDistances.index;
  featureVector[11] = pinchDistances.middle;
  featureVector[12] = pinchDistances.ring;
  featureVector[13] = pinchDistances.pinky;

  featureVector[14] = palmBasis.normal.x;
  featureVector[15] = palmBasis.normal.y;
  featureVector[16] = palmBasis.normal.z;

  featureVector[17] = magnitude(subtract(landmarks[8], landmarks[12])) / palmBasis.palmSpan;
  featureVector[18] = magnitude(subtract(landmarks[16], landmarks[20])) / palmBasis.palmSpan;

  return {
    palmBasis,
    fingers,
    pinchDistances,
    featureVector,
  };
}

/**
 * Convenience wrapper returning only the 19-element Float32Array kinematic vector,
 * or an empty zeroed Float32Array(19) when landmarks are incomplete.
 */
export function extractKinematicFeatureVector(landmarks: readonly Landmark3D[]): Float32Array {
  if (!landmarks || landmarks.length !== 21) {
    return new Float32Array(19);
  }
  return analyzeHandKinematics(landmarks).featureVector;
}
