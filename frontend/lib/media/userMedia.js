export function requestUserMedia(constraints) {
  const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (!getUserMedia) {
    if (typeof location !== "undefined" && location.protocol === "http:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      throw new Error(`Camera needs HTTPS. Open https://${location.host}${location.pathname}${location.search}`);
    }
    throw new Error("Camera is not available in this browser.");
  }
  return getUserMedia(constraints);
}
