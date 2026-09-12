export function computeVideoDisplayRect(elementWidth, elementHeight, videoWidth, videoHeight) {
  if (elementWidth <= 0 || elementHeight <= 0 || videoWidth <= 0 || videoHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0, elementWidth, elementHeight };
  }
  const videoAspect = videoWidth / videoHeight;
  const elementAspect = elementWidth / elementHeight;
  let width;
  let height;
  if (videoAspect > elementAspect) {
    width = elementWidth;
    height = elementWidth / videoAspect;
  } else {
    height = elementHeight;
    width = elementHeight * videoAspect;
  }
  return {
    x: (elementWidth - width) / 2,
    y: (elementHeight - height) / 2,
    width,
    height,
    elementWidth,
    elementHeight,
  };
}

export function landmarkToScreenPoint(landmark, rect) {
  return {
    x: rect.x + landmark.x * rect.width,
    y: rect.y + landmark.y * rect.height,
  };
}
