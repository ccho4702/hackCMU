export const METRIC_KEYS = ["gaze", "expressionActivity", "stability", "expressiveness"];

export const METRIC_LABELS = {
  gaze: "Gaze",
  expressionActivity: "Expression",
  stability: "Stability",
  expressiveness: "Expressiveness",
};

export const METRIC_HELP = {
  gaze: "Share of this second you stay on camera (0–100). Drift and look-aways lower the score; blinks are ignored.",
  expressionActivity:
    "How fast facial action-unit intensity is changing (0–100). A frozen face scores low; natural motion scores higher.",
  stability:
    "How steady your head stays (0–100). Slow emphasis is fine; fast yaw, pitch, roll, or jitter drops the score.",
  expressiveness:
    "How much of your facial action-unit range you use (0–100). One repeated motion scores lower than a broader set.",
};

export const DEFAULT_METRIC_THRESHOLDS = {
  gaze: { warning: 64, critical: 42 },
  expressionActivity: { warning: 55, critical: 35 },
  stability: { warning: 65, critical: 45 },
  expressiveness: { warning: 55, critical: 35 },
};

export function metricKeyFromAlert(metric) {
  if (metric === "expression_activity") return "expressionActivity";
  return metric;
}

export function scoreTone(value, threshold) {
  if (value == null || !threshold) return "ok";
  if (value < threshold.critical) return "critical";
  if (value < threshold.warning) return "warning";
  return "ok";
}
