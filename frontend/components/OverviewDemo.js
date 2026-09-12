"use client";

import { useState } from "react";
import { Film } from "lucide-react";

export default function OverviewDemo() {
  const [failed, setFailed] = useState(false);

  return (
    <section className="overview-demo" aria-labelledby="overview-demo-title">
      <div className="overview-demo-copy">
        <span className="overview-demo-label"><Film size={15} aria-hidden="true" /> PRODUCT DEMO</span>
        <h2 id="overview-demo-title">See Optune in action</h2>
        <p>A recorded walkthrough, from your first upload to a better next take.</p>
        <span className="overview-demo-duration">1 min 56 sec</span>
      </div>
      <div className="overview-demo-player">
        <span className="overview-demo-watermark" aria-hidden="true">DEMO VIDEO</span>
        <video
          controls
          playsInline
          preload="none"
          poster="/demo/optune-demo-poster.png"
          src="/demo/optune-demo.mp4"
          aria-label="Optune product demo video"
          onError={() => setFailed(true)}
        >
          <a href="/demo/optune-demo.mp4">Download the product demo</a>
        </video>
        {failed && (
          <p className="overview-demo-error" role="alert">
            The demo could not load. <a href="/demo/optune-demo.mp4" download>Download the video</a> to watch it.
          </p>
        )}
      </div>
    </section>
  );
}
