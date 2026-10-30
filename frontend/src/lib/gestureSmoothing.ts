/**
 * Temporal Landmark Smoother & Classification Stabilizer for SignBridge.
 *
 * Smooths 21 3D hand landmarks across consecutive video frames to prevent
 * jitter and eliminates character flickering in rapid classification streams.
 */

export interface Landmark3D {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface SmootherConfig {
  alpha: number; // EMA smoothing factor (0 = infinite smoothing, 1 = no smoothing)
  maxJumpThreshold: number; // Max Euclidean distance allowed between consecutive frames
  windowSize: number; // Sliding window size for prediction majority voting
  confidenceThreshold: number; // Minimum confidence to accept a prediction
}

export const DEFAULT_SMOOTHER_CONFIG: SmootherConfig = {
  alpha: 0.65,
  maxJumpThreshold: 0.25, // Normalized screen space
  windowSize: 5,
  confidenceThreshold: 0.6,
};

export class TemporalLandmarkSmoother {
  private prevLandmarks: Landmark3D[] | null = null;
  private predictionHistory: string[] = [];
  private config: SmootherConfig;

  constructor(config: Partial<SmootherConfig> = {}) {
    this.config = { ...DEFAULT_SMOOTHER_CONFIG, ...config };
  }

  /**
   * Smooths 21 hand landmarks using Exponential Moving Average (EMA)
   * with adaptive outlier rejection.
   */
  public smoothLandmarks(rawLandmarks: Landmark3D[]): Landmark3D[] {
    if (!rawLandmarks || rawLandmarks.length === 0) {
      this.prevLandmarks = null;
      return [];
    }

    if (!this.prevLandmarks || this.prevLandmarks.length !== rawLandmarks.length) {
      this.prevLandmarks = rawLandmarks.map(pt => ({ ...pt }));
      return this.prevLandmarks;
    }

    const smoothed: Landmark3D[] = [];
    const alpha = this.config.alpha;
    const threshold = this.config.maxJumpThreshold;

    for (let i = 0; i < rawLandmarks.length; i++) {
      const raw = rawLandmarks[i];
      const prev = this.prevLandmarks[i];

      const dx = raw.x - prev.x;
      const dy = raw.y - prev.y;
      const dz = raw.z - prev.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // If jump exceeds threshold, clamp the delta to prevent teleports
      let targetX = raw.x;
      let targetY = raw.y;
      let targetZ = raw.z;

      if (dist > threshold && dist > 0) {
        const scale = threshold / dist;
        targetX = prev.x + dx * scale;
        targetY = prev.y + dy * scale;
        targetZ = prev.z + dz * scale;
      }

      const smoothedPt: Landmark3D = {
        x: prev.x * (1 - alpha) + targetX * alpha,
        y: prev.y * (1 - alpha) + targetY * alpha,
        z: prev.z * (1 - alpha) + targetZ * alpha,
        visibility: raw.visibility,
      };

      smoothed.push(smoothedPt);
    }

    this.prevLandmarks = smoothed;
    return smoothed;
  }

  /**
   * Stabilizes prediction tokens using a rolling majority-vote window.
   * Returns stabilized token or null if no stable consensus.
   */
  public stabilizePrediction(token: string, confidence: number): string | null {
    if (!token || confidence < this.config.confidenceThreshold) {
      return null;
    }

    this.predictionHistory.push(token);
    if (this.predictionHistory.length > this.config.windowSize) {
      this.predictionHistory.shift();
    }

    // Compute frequency counts
    const counts = new Map<string, number>();
    for (const t of this.predictionHistory) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }

    let topToken: string | null = null;
    let maxCount = 0;

    for (const [t, count] of counts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        topToken = t;
      }
    }

    // Require strict majority (e.g., at least 3 out of 5 frames)
    const requiredVotes = Math.ceil(this.config.windowSize / 2);
    if (maxCount >= requiredVotes) {
      return topToken;
    }

    return null;
  }

  /**
   * Resets temporal state (call on hand loss or video cut).
   */
  public reset(): void {
    this.prevLandmarks = null;
    this.predictionHistory = [];
  }
}
