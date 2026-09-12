// Draws a MediaPipe result onto the overlay canvas.
// Expected shape (all coordinates normalized 0-1, see backend /api/ws/landmarks):
//   { pose: [{x, y, visibility}], face: [{x, y}], hands: [[{x, y}], ...] }

export const LAYERS = {
  pose: { label: "Pose", color: "#2f6bff" },
  face: { label: "Face", color: "#8fb4ff" },
  hands: { label: "Hands", color: "#22c3ee" },
};

const POSE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
];

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const MIN_VISIBILITY = 0.5;

const isVisible = (p) => p && (p.visibility ?? 1) >= MIN_VISIBILITY;

function drawSkeleton(ctx, points, connections, color, scale) {
  const { width: w, height: h } = ctx.canvas;

  ctx.strokeStyle = color;
  ctx.lineWidth = 4 * scale;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [a, b] of connections) {
    const p = points[a];
    const q = points[b];
    if (!isVisible(p) || !isVisible(q)) continue;
    ctx.moveTo(p.x * w, p.y * h);
    ctx.lineTo(q.x * w, q.y * h);
  }
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 2.5 * scale;
  for (const p of points) {
    if (!isVisible(p)) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 4.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawPoints(ctx, points, color, scale) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = color;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 1.6 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawLandmarks(ctx, result, visible) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (!result) return;

  // Keep stroke sizes consistent across resolutions (but readable on low-res cameras)
  const scale = Math.max(width / 1280, 0.75);

  if (visible.face && result.face?.length) {
    ctx.globalAlpha = 0.75;
    drawPoints(ctx, result.face, LAYERS.face.color, scale);
    ctx.globalAlpha = 1;
  }
  if (visible.pose && result.pose?.length) {
    drawSkeleton(ctx, result.pose, POSE_CONNECTIONS, LAYERS.pose.color, scale);
  }
  if (visible.hands) {
    for (const hand of result.hands ?? []) {
      drawSkeleton(ctx, hand, HAND_CONNECTIONS, LAYERS.hands.color, scale);
    }
  }
}

// Number of landmarks detected per layer, for the side panel.
export function countLandmarks(result) {
  return {
    pose: result?.pose?.filter(isVisible).length ?? 0,
    face: result?.face?.length ?? 0,
    hands: result?.hands?.length ?? 0,
  };
}
