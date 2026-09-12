import { describe, expect, it } from "vitest";
import { aggregateWindows, rangeStats } from "@/lib/analysis/aggregate";
import { formatScore, unavailableReason } from "@/lib/analysis/format";
import type { WindowAnalysis } from "@/lib/types/analysis";

function window(start: number, gaze: number | null): WindowAnalysis {
  return {
    startMs: start,
    endMs: start + 1000,
    sampleCount: 8,
    validCoverage: 1,
    metrics: {
      gaze,
      expressionActivity: 70,
      stability: 80,
      expressiveness: 60,
    },
    features: {
      headYawMean: null,
      headPitchMean: null,
      headRollMean: null,
      gazeHorizontalMean: null,
      gazeVerticalMean: null,
      blendshapeVariance: null,
      expressionVelocity: null,
      headAngularSpeed: null,
      jitter: null,
      expressivenessRange: null,
      activationDiversity: null,
    },
  };
}

describe("range aggregation", () => {
  it("averages only valid samples", () => {
    const windows = [window(0, 80), window(500, null), window(1000, 60)];
    const metrics = aggregateWindows(windows, 0, 2000);
    expect(metrics.gaze).toBe(70);
  });

  it("compares a selection against the whole video", () => {
    const windows = [window(0, 50), window(1000, 90)];
    const stats = rangeStats(windows, 1000, 2000, {
      gaze: 70,
      expressionActivity: 70,
      stability: 80,
      expressiveness: 60,
    });
    expect(stats.metrics.gaze).toBe(90);
    expect(stats.deltas.gaze).toBe(20);
  });
});

describe("missing metrics", () => {
  it("does not render a zero for unavailable gaze", () => {
    expect(formatScore(null)).toBe("—");
    expect(formatScore(0)).toBe("0");
    expect(unavailableReason("gaze", true, false)).toBe("Insufficient eye visibility");
    expect(unavailableReason("gaze", false, false)).toBe("No face in this sample");
  });
});
