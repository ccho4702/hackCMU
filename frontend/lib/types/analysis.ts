export type AnalysisStatus =
  | "queued"
  | "preparing"
  | "analyzing"
  | "aggregating"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

export type Landmark3D = {
  x: number;
  y: number;
  z: number;
};

export type HeadPose = {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
};

export type GazeEstimate = {
  horizontal: number;
  vertical: number;
  confidence: number;
  valid: boolean;
};

export type FrameQuality = {
  faceDetected: boolean;
  gazeValid: boolean;
  poseValid: boolean;
  blendshapesValid: boolean;
};

export type FrameAnalysis = {
  timestampMs: number;
  landmarks: Landmark3D[] | null;
  blendshapes: Record<string, number> | null;
  facialTransformationMatrix?: number[] | null;
  headPose?: HeadPose | null;
  gaze?: GazeEstimate | null;
  quality: FrameQuality;
};

export type MetricThreshold = {
  warning: number;
  critical: number;
};

export type ThresholdConfig = {
  gaze: MetricThreshold;
  expressionActivity: MetricThreshold;
  stability: MetricThreshold;
  expressiveness: MetricThreshold;
};

export type WindowMetrics = {
  gaze: number | null;
  expressionActivity: number | null;
  stability: number | null;
  expressiveness: number | null;
};

export type WindowFeatures = {
  headYawMean: number | null;
  headPitchMean: number | null;
  headRollMean: number | null;
  gazeHorizontalMean: number | null;
  gazeVerticalMean: number | null;
  blendshapeVariance: number | null;
  expressionVelocity: number | null;
  headAngularSpeed: number | null;
  jitter: number | null;
  expressivenessRange: number | null;
  activationDiversity: number | null;
};

export type WindowAnalysis = {
  startMs: number;
  endMs: number;
  sampleCount: number;
  validCoverage: number;
  metrics: WindowMetrics;
  features: WindowFeatures;
};

export type AnalysisSegment = {
  id: string;
  type: string;
  kind: "weak" | "strong";
  startMs: number;
  endMs: number;
  durationMs: number;
  severity: "warning" | "critical" | "strong";
  metrics: {
    averageScore: number | null;
    minimumScore: number | null;
    maximumScore: number | null;
  };
  context: {
    headYawMean: number | null;
    headPitchMean: number | null;
    gazeHorizontalMean: number | null;
    validCoverage: number | null;
  };
};

export type VideoMetadata = {
  videoId: string;
  fileName: string;
  durationMs: number;
  width: number;
  height: number;
  fileSizeBytes: number;
  sourceFps?: number | null;
  source?: "upload" | "live";
};

export type AnalysisProvenance = {
  createdAt: string;
  mediapipeVersion: string;
  modelVersion: string;
  modelAssetId: string;
  modelChecksumSha256?: string | null;
  scoringVersion: string;
  backendVersion?: string | null;
  analyzer: string;
  mock: boolean;
};

export type AnalysisQualitySummary = {
  validFaceCoverage: number;
  validGazeCoverage: number;
  validPoseCoverage: number;
  validBlendshapeCoverage: number;
  sampledFrameCount: number;
  detectedFaceFrameCount: number;
  noFaceFrameCount: number;
};

export type TimeInterval = {
  startMs: number;
  endMs: number;
  label?: string | null;
};

export type BlendshapeStat = {
  name: string;
  mean: number;
  range: number;
};

export type AnalysisSummary = {
  overall: number | null;
  gaze: number | null;
  expressionActivity: number | null;
  stability: number | null;
  expressiveness: number | null;
  strongestInterval: TimeInterval | null;
  weakestInterval: TimeInterval | null;
  timeBelowGazeThresholdRatio: number | null;
  longestLowExpressionIntervalMs: number | null;
  dominantBlendshapes: BlendshapeStat[];
};

export type ResultConfig = {
  analysisFps: number;
  windowSizeMs: number;
  strideMs: number;
  minimumValidCoverage: number;
  smoothingAlpha: number;
  minSegmentDurationMs: number;
  mergeGapMs: number;
  strongScore: number;
  minStrongDurationMs: number;
  alertEnterMs?: number;
  alertExitMs?: number;
  alertHysteresis?: number;
  thresholds: ThresholdConfig;
};

export type AnalysisResult = {
  schemaVersion: string;
  analysisId: string;
  video: VideoMetadata;
  provenance: AnalysisProvenance;
  config: ResultConfig;
  quality: AnalysisQualitySummary;
  summary: AnalysisSummary;
  segments: AnalysisSegment[];
  windows: WindowAnalysis[];
  frames: FrameAnalysis[];
  alerts?: DeliveryAlert[];
};

export type AnalysisProgress = {
  analysisId: string;
  status: AnalysisStatus;
  progress: number;
  phase: string;
  processedMs?: number | null;
  durationMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  mock?: boolean;
};

export type AnalysisAccepted = {
  analysisId: string;
  status: AnalysisStatus;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type MetricKey = keyof WindowMetrics;

export const METRIC_KEYS: MetricKey[] = [
  "gaze",
  "expressionActivity",
  "stability",
  "expressiveness",
];

export const METRIC_LABELS: Record<MetricKey, string> = {
  gaze: "Gaze",
  expressionActivity: "Expression",
  stability: "Stability",
  expressiveness: "Expressiveness",
};

export type AlertRegion = "eyes" | "contour" | "mouthBrows";

export type DeliveryAlert = {
  id: string;
  metric: MetricKey;
  severity: "warning" | "critical";
  region: AlertRegion;
  message: string;
  startMs: number;
  endMs: number | null;
  durationMs: number | null;
};

export type LiveSessionAccepted = {
  sessionId: string;
  analysisId: string;
  status: "live";
  analysisFps: number;
  windowSizeMs: number;
  strideMs: number;
  mock: boolean;
};

export type LiveTick = {
  sessionId: string;
  timestampMs: number;
  durationMs: number;
  frame: FrameAnalysis;
  window: WindowAnalysis | null;
  windows: WindowAnalysis[];
  alerts: DeliveryAlert[];
};

export type LiveSessionStopResult = {
  analysisId: string;
  status: "completed";
};
