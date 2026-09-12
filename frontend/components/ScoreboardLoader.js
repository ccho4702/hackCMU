"use client";

import { useId } from "react";

const RINGS = [
  { count: 28, radius: 86, reverse: false },
  { count: 18, radius: 62, reverse: true },
];

const LOGO_STYLE = { width: 58, height: 58, maxWidth: 58, maxHeight: 58, display: "block" };

function ElevenMark() {
  return (
    <svg viewBox="0 0 24 24" width="58" height="58" style={LOGO_STYLE} aria-hidden="true">
      <path fill="currentColor" d="M4.6035 0v24h4.9317V0zm9.8613 0v24h4.9317V0z" />
    </svg>
  );
}

function GeminiMark({ fillId }) {
  return (
    <svg viewBox="0 0 24 24" width="58" height="58" style={LOGO_STYLE} aria-hidden="true">
      <defs>
        <linearGradient id={fillId} x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4C8DFF" />
          <stop offset="42%" stopColor="#A855F7" />
          <stop offset="78%" stopColor="#F472B6" />
          <stop offset="100%" stopColor="#FB923C" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${fillId})`}
        d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
      />
    </svg>
  );
}

export default function ScoreboardLoader({ brand, label, ticker }) {
  const fillId = `scoreboard-fill-${useId().replace(/:/g, "")}`;
  const loop = `${ticker}  •  ${ticker}  •  `;
  const provider = brand === "gemini" ? "Gemini" : "ElevenLabs";
  return (
    <div
      className={`scoreboard scoreboard-${brand}`}
      data-provider={provider}
      role="status"
      aria-live="polite"
      aria-label={label}
      style={{ position: "relative", overflow: "hidden", minHeight: 248, maxHeight: 320 }}
    >
      <span className="scoreboard-bulb scoreboard-bulb-tl" aria-hidden="true" />
      <span className="scoreboard-bulb scoreboard-bulb-tr" aria-hidden="true" />
      <span className="scoreboard-bulb scoreboard-bulb-bl" aria-hidden="true" />
      <span className="scoreboard-bulb scoreboard-bulb-br" aria-hidden="true" />
      <div className="scoreboard-chrome">
        <span className="scoreboard-live">LIVE</span>
        <div className="scoreboard-ticker">
          <span>{loop}</span>
          <span aria-hidden="true">{loop}</span>
        </div>
        <span className="scoreboard-brand">{brand === "gemini" ? "GEMINI" : "11LABS"}</span>
      </div>
      <div className="scoreboard-stage">
        <div className="scoreboard-grid" aria-hidden="true" />
        <div className="scoreboard-beacon" aria-hidden="true" />
        {RINGS.map((ring) => (
          <div
            key={ring.radius}
            className={`scoreboard-ring${ring.reverse ? " reverse" : ""}`}
            style={{ "--count": ring.count }}
            aria-hidden="true"
          >
            {Array.from({ length: ring.count }, (_, index) => (
              <span key={index} style={{ "--i": index, "--radius": `${ring.radius}px` }} />
            ))}
          </div>
        ))}
        <div className="scoreboard-logo">
          {brand === "gemini" ? <GeminiMark fillId={fillId} /> : <ElevenMark />}
        </div>
      </div>
      <p className="scoreboard-caption">{label}</p>
      <div className="scoreboard-scanlines" aria-hidden="true" />
    </div>
  );
}
