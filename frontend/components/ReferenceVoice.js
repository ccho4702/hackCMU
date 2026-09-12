"use client";

import { useRef, useState } from "react";
import { Download, Pause, Play } from "lucide-react";

function clock(seconds) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export default function ReferenceVoice({ src, failed = false }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState("");

  async function toggle() {
    if (!audio.current) return;
    if (!audio.current.paused) { audio.current.pause(); return; }
    setError("");
    setWaiting(true);
    try { await audio.current.play(); }
    catch { setError("Audio could not play. Try again or download it."); }
    finally { setWaiting(false); }
  }

  return (
    <section className="reference-voice" aria-labelledby="reference-voice-title">
      <div className="reference-voice-heading">
        <h2 id="reference-voice-title">Reference voice</h2>
        <p>Listen to the revised script.</p>
      </div>
      {src ? <div className="reference-transport">
        <audio ref={audio} src={src} preload="metadata" aria-label="Improved speech"
          onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setWaiting(false); }}
          onPlaying={() => setWaiting(false)} onWaiting={() => setWaiting(true)}
          onEnded={() => { setPlaying(false); setWaiting(false); }}
          onError={() => { setPlaying(false); setWaiting(false); setError("Audio could not load. Try again or download it."); }} />
        <button type="button" className="reference-play" onClick={toggle}
          aria-label={playing ? "Pause reference voice" : "Play reference voice"} aria-busy={waiting}>
          {playing ? <Pause size={17} fill="currentColor" aria-hidden="true" /> : <Play size={17} fill="currentColor" aria-hidden="true" />}
        </button>
        <div className="reference-progress">
          <input type="range" min="0" max={duration || 1} step="0.01" value={Math.min(position, duration || 0)}
            disabled={!duration} aria-label="Reference voice position" aria-valuetext={`${clock(position)} of ${clock(duration)}`}
            style={{ "--played": `${duration ? Math.min(100, position / duration * 100) : 0}%` }}
            onChange={(event) => { const value=Number(event.target.value); audio.current.currentTime=value; setPosition(value); }} />
          <div className="reference-time"><span>{clock(position)}</span><span>{clock(duration)}</span></div>
        </div>
        <a className="reference-download" href={src} download aria-label="Download reference audio" title="Download audio">
          <Download size={18} aria-hidden="true" />
        </a>
        {error && <p className="reference-error" role="alert">{error}</p>}
      </div> : <p className="reference-pending">{failed ? "Reference audio is not available for this session." : "Preparing your audio…"}</p>}
    </section>
  );
}
