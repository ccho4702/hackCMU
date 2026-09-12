import { describe, expect, it } from "vitest";
import { alertsAt, findNearestIndex, frameAt, windowAt } from "@/lib/analysis/lookup";
import type { DeliveryAlert, FrameAnalysis, WindowAnalysis } from "@/lib/types/analysis";

function frame(ms: number, detected = true): FrameAnalysis {
  return {
    timestampMs: ms,
    landmarks: detected ? [{ x: 0.5, y: 0.5, z: 0 }] : null,
    blendshapes: detected ? { jawOpen: 0.2 } : null,
    quality: {
      faceDetected: detected,
      gazeValid: detected,
      poseValid: detected,
      blendshapesValid: detected,
    },
  };
}

function window(start: number, gaze: number | null): WindowAnalysis {
  return {
    startMs: start,
    endMs: start + 1000,
    sampleCount: 10,
    validCoverage: gaze == null ? 0.2 : 1,
    metrics: { gaze, expressionActivity: 70, stability: 80, expressiveness: 60 },
    features: {
      headYawMean: 0,
      headPitchMean: 0,
      headRollMean: 0,
      gazeHorizontalMean: 0,
      gazeVerticalMean: 0,
      blendshapeVariance: 0.1,
      expressionVelocity: 0.2,
      headAngularSpeed: 4,
      jitter: 1,
      expressivenessRange: 0.1,
      activationDiversity: 0.2,
    },
  };
}

describe("timestamp lookup", () => {
  it("finds nearest analyzed frame", () => {
    const stamps = [0, 80, 160, 240];
    expect(findNearestIndex(stamps, 0)).toBe(0);
    expect(findNearestIndex(stamps, 70)).toBe(1);
    expect(findNearestIndex(stamps, 200)).toBe(2);
    expect(findNearestIndex(stamps, 900)).toBe(3);
  });

  it("returns the matching window for a media time", () => {
    const windows = [window(0, 80), window(500, 40), window(1000, 90)];
    expect(windowAt(windows, 120)?.startMs).toBe(0);
    expect(windowAt(windows, 700)?.metrics.gaze).toBe(40);
  });

  it("does not invent a face when landmarks are missing", () => {
    const frames = [frame(0, false), frame(80, true)];
    const stamps = frames.map((f) => f.timestampMs);
    expect(frameAt(frames, stamps, 10)?.quality.faceDetected).toBe(false);
    expect(frameAt(frames, stamps, 10)?.landmarks).toBeNull();
  });

  it("selects active delivery alerts from windowed intervals", () => {
    const alerts: DeliveryAlert[] = [
      {
        id: "alrt_1",
        metric: "gaze",
        severity: "warning",
        region: "eyes",
        message: "Gaze drift detected",
        startMs: 1000,
        endMs: 2400,
        durationMs: 1400,
      },
    ];
    expect(alertsAt(alerts, 900)).toHaveLength(0);
    expect(alertsAt(alerts, 1000)[0]?.id).toBe("alrt_1");
    expect(alertsAt(alerts, 2399)).toHaveLength(1);
    expect(alertsAt(alerts, 2400)).toHaveLength(0);
  });
});
