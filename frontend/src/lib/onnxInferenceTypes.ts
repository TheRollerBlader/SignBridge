import type { Landmark3D } from './gestureSmoothing';

/**
 * Strict TypeScript types and mathematical normalization contracts
 * for client-side ONNX Runtime Web fingerspelling and gesture classification.
 */

export interface BoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  width: number;
  height: number;
}

export interface InferencePrediction {
  label: string;
  probability: number;
}

export interface InferenceResult {
  topPrediction: InferencePrediction;
  topK: InferencePrediction[];
  latencyMs: number;
  normalizedTensor: Float32Array;
  wristRelativeSpan: number;
}

export interface OnnxSessionConfig {
  modelPath: string;
  executionProvider: 'webgl' | 'wasm' | 'webgpu';
  numThreads?: number;
  confidenceThreshold?: number;
}

export const ASL_ALPHABET_LABELS: readonly string[] = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
  'U', 'V', 'W', 'X', 'Y', 'Z', 'SPACE', 'DELETE'
] as const;

/**
 * Computes bounding box enclosing all 21 hand landmarks in normalized [0, 1] screen space.
 */
export function computeLandmarkBoundingBox(landmarks: Landmark3D[]): BoundingBox {
  if (!landmarks || landmarks.length === 0) {
    return { xMin: 0, yMin: 0, xMax: 0, yMax: 0, width: 0, height: 0 };
  }

  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;

  for (const pt of landmarks) {
    if (pt.x < xMin) xMin = pt.x;
    if (pt.y < yMin) yMin = pt.y;
    if (pt.x > xMax) xMax = pt.x;
    if (pt.y > yMax) yMax = pt.y;
  }

  return {
    xMin,
    yMin,
    xMax,
    yMax,
    width: Math.max(0, xMax - xMin),
    height: Math.max(0, yMax - yMin)
  };
}

/**
 * Normalizes 21 MediaPipe hand landmarks into invariant relative coordinates:
 * 1. Shifts wrist (Landmark 0) to origin (0, 0, 0).
 * 2. Scales coordinates by the distance between wrist (0) and MCP of middle finger (9)
 *    to achieve scale invariance regardless of hand distance from camera.
 * 3. Flattens into a 63-element Float32Array [x0, y0, z0, ..., x20, y20, z20].
 */
export function normalizeLandmarkTensor(landmarks: Landmark3D[]): Float32Array {
  const flattened = new Float32Array(63);
  if (!landmarks || landmarks.length !== 21) {
    return flattened;
  }

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];

  // Euclidean distance between wrist and middle MCP
  const dx = middleMcp.x - wrist.x;
  const dy = middleMcp.y - wrist.y;
  const dz = middleMcp.z - wrist.z;
  const palmSpan = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1.0;

  for (let i = 0; i < 21; i++) {
    const pt = landmarks[i];
    const offset = i * 3;
    flattened[offset] = (pt.x - wrist.x) / palmSpan;
    flattened[offset + 1] = (pt.y - wrist.y) / palmSpan;
    flattened[offset + 2] = (pt.z - wrist.z) / palmSpan;
  }

  return flattened;
}

/**
 * Computes numerically stable softmax probabilities over raw model logits.
 */
export function computeSoftmax(logits: number[] | Float32Array, temperature = 1.0): Float32Array {
  const n = logits.length;
  if (n === 0) return new Float32Array(0);

  const safeTemp = Math.max(1e-5, temperature);
  let maxLogit = -Infinity;
  for (let i = 0; i < n; i++) {
    if (logits[i] > maxLogit) maxLogit = logits[i];
  }

  const exps = new Float32Array(n);
  let sumExp = 0.0;
  for (let i = 0; i < n; i++) {
    const val = Math.exp((logits[i] - maxLogit) / safeTemp);
    exps[i] = val;
    sumExp += val;
  }

  if (sumExp > 0) {
    for (let i = 0; i < n; i++) {
      exps[i] /= sumExp;
    }
  }

  return exps;
}

/**
 * Ranks softmax probabilities and extracts top-K class labels.
 */
export function extractTopK(
  probabilities: Float32Array,
  labels: readonly string[],
  k = 3
): InferencePrediction[] {
  const count = Math.min(probabilities.length, labels.length);
  const indexed: Array<{ index: number; probability: number }> = [];

  for (let i = 0; i < count; i++) {
    indexed.push({ index: i, probability: probabilities[i] });
  }

  indexed.sort((a, b) => b.probability - a.probability);

  const topResults: InferencePrediction[] = [];
  const limit = Math.min(k, count);
  for (let i = 0; i < limit; i++) {
    topResults.push({
      label: labels[indexed[i].index],
      probability: indexed[i].probability
    });
  }

  return topResults;
}
