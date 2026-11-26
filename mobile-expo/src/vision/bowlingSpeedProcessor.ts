/**
 * CreaseRadar VisionCamera Frame Processor (60–120 FPS Worklet)
 *
 * Perspective Model (Standing Umpire's View at Bowler's End):
 * - Release Line (y = releaseLineRatio): Bowler's popping crease (closer to camera, lower half of frame)
 * - Reach Line   (y = reachLineRatio):   Striker's popping crease (farther down pitch, upper half of frame)
 * - Ball travels upward in 2D image coordinates from releaseY -> reachY.
 *
 * Sub-frame Linear Interpolation:
 *   When ball centroid crosses y_line between frame (k-1) at t_{k-1} and frame (k) at t_k:
 *     alpha = (y_line - y_{k-1}) / (y_k - y_{k-1})
 *     t_cross = t_{k-1} + alpha * (t_k - t_{k-1})
 *   This reduces 60fps quantization error (16.67ms) down to < 1.5ms.
 */

export type BallColorProfile = 'TAPE_GREEN' | 'TENNIS_YELLOW' | 'LEATHER_RED' | 'LEATHER_WHITE';

export interface CalibrationConfig {
  releaseLineYNorm: number; // e.g., 0.78 (bottom/near crease)
  reachLineYNorm: number;   // e.g., 0.34 (top/far striker crease)
  pitchDistanceYards: number; // 12–16 yd Short Pitch, 22 yd Long Pitch
  ballProfile: BallColorProfile;
}

export interface SpeedMeasurement {
  speedKmh: number;
  speedMph: number;
  deltaTimeMs: number;
  releaseTsMs: number;
  reachTsMs: number;
  confidence: number;
}

const YARDS_TO_METERS = 0.9144;
const MS_TO_KMH = 3.6;
const KMH_TO_MPH = 0.621371;

/**
 * Pure worklet-safe HSV color mask matcher for fast C++/JSI execution.
 * Tuned for bright outdoor daylight tape-balls and leather balls.
 */
export function matchesBallColorRGB(
  r: number,
  g: number,
  b: number,
  profile: BallColorProfile
): boolean {
  'worklet';
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const v = max / 255;
  const s = max === 0 ? 0 : delta / max;

  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;

  switch (profile) {
    case 'TAPE_GREEN':
      // High-visibility fluorescent green/lime cricket tape ball
      return h >= 70 && h <= 155 && s >= 0.38 && v >= 0.35;
    case 'TENNIS_YELLOW':
      // Optic yellow tennis ball
      return h >= 42 && h <= 72 && s >= 0.42 && v >= 0.45;
    case 'LEATHER_RED':
      // Cherry crimson leather ball (hue wraps around 0/360)
      return (h <= 22 || h >= 338) && s >= 0.45 && v >= 0.22 && v <= 0.85;
    case 'LEATHER_WHITE':
      // White ball against pitch clay/green grass
      return s <= 0.18 && v >= 0.82;
  }
}

/**
 * Computes delivery speed from sub-frame interpolated release and reach timestamps.
 */
export function computeDeliverySpeed(
  releaseTsMs: number,
  reachTsMs: number,
  pitchDistanceYards: number
): SpeedMeasurement | null {
  'worklet';
  const deltaTimeMs = reachTsMs - releaseTsMs;
  // Physical plausibility guard: cricket balls on 10–22yd pitches take 220ms–2200ms
  if (deltaTimeMs < 180 || deltaTimeMs > 2800) {
    return null;
  }

  const distanceMeters = pitchDistanceYards * YARDS_TO_METERS;
  const deltaSeconds = deltaTimeMs / 1000;
  const speedMps = distanceMeters / deltaSeconds;
  const speedKmh = Number((speedMps * MS_TO_KMH).toFixed(1));
  const speedMph = Number((speedKmh * KMH_TO_MPH).toFixed(1));

  return {
    speedKmh,
    speedMph,
    deltaTimeMs: Number(deltaTimeMs.toFixed(1)),
    releaseTsMs,
    reachTsMs,
    confidence: deltaTimeMs >= 260 && deltaTimeMs <= 1600 ? 0.94 : 0.78,
  };
}

/**
 * Interpolates exact line-crossing timestamp between two consecutive camera frames.
 */
export function interpolateCrossingTimestamp(
  prevYNorm: number,
  prevTsMs: number,
  currYNorm: number,
  currTsMs: number,
  lineYNorm: number
): number | null {
  'worklet';
  // Moving upward in image (bowler's crease near bottom -> batsman's crease near top)
  const crossedUpward = prevYNorm >= lineYNorm && currYNorm < lineYNorm;
  if (!crossedUpward) return null;

  const dy = currYNorm - prevYNorm;
  if (Math.abs(dy) < 1e-5) return currTsMs;
  const alpha = (lineYNorm - prevYNorm) / dy;
  return prevTsMs + alpha * (currTsMs - prevTsMs);
}
