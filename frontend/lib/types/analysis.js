export const METRIC_KEYS = ["gaze", "expressionActivity", "stability", "expressiveness"];

export const METRIC_LABELS = {
  gaze: "Gaze",
  expressionActivity: "Expression",
  stability: "Stability",
  expressiveness: "Expressiveness",
};

export const METRIC_HELP = {
  gaze: "How much you look toward the camera (0–100). The score falls when your eyes or head turn away.",
  expressionActivity:
    "How much your face is moving (0–100). A still or frozen face scores lower; natural motion scores higher.",
  stability:
    "How steady your head stays (0–100). Fast yaw, pitch, or roll drops the score; calm posture keeps it high.",
  expressiveness:
    "How much of your facial range you use (0–100). Small, repeated motions score lower; broader movement scores higher.",
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
