"use client";

import { useEffect, useRef } from "react";
import { ProviderMark } from "./ProviderProgress";

const actions = {
  prepare: "Preparing your recording",
  nonverbal_analysis: "Reviewing your delivery",
  transcription: "Transcribing your speech",
  script_analysis: "Refining your script",
  voice_cloning: "Creating your voice",
  speech_generation: "Generating your reference",
};

export default function ProcessingCursor({ provider, id }) {
  const badge = useRef(null);
  useEffect(() => {
    const element = badge.current;
    const mouse = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let lastTime = 0;
    let current = null;
    let target = null;
    let width = element.offsetWidth;
    let height = element.offsetHeight;
    const dock = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      current = target = null;
      delete element.dataset.following;
      element.style.removeProperty("transform");
    };
    const animate = (time) => {
      const elapsed = lastTime ? Math.min(time - lastTime, 50) : 16;
      lastTime = time;
      const blend = 1 - Math.exp(-elapsed / 65);
      current.x += (target.x - current.x) * blend;
      current.y += (target.y - current.y) * blend;
      element.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;
      if (Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > 0.15) {
        frame = requestAnimationFrame(animate);
      } else { frame = 0; lastTime = 0; }
    };
    const move = (event) => {
      if (!mouse.matches || reducedMotion.matches || event.pointerType !== "mouse") return;
      const x = event.clientX + width + 24 < window.innerWidth ? event.clientX + 22 : event.clientX - width - 22;
      const y = event.clientY + height + 24 < window.innerHeight ? event.clientY + 22 : event.clientY - height - 22;
      target = {
        x: Math.max(12, Math.min(x, window.innerWidth - width - 12)),
        y: Math.max(12, Math.min(y, window.innerHeight - height - 12)),
      };
      if (!current) current = { ...target };
      element.dataset.following = "true";
      if (!frame) frame = requestAnimationFrame(animate);
    };
    const leave = (event) => { if (!event.relatedTarget) dock(); };
    const resize = () => { dock(); width = element.offsetWidth; height = element.offsetHeight; };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerout", leave);
    window.addEventListener("blur", dock);
    window.addEventListener("resize", resize);
    mouse.addEventListener("change", dock);
    reducedMotion.addEventListener("change", dock);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerout", leave);
      window.removeEventListener("blur", dock);
      window.removeEventListener("resize", resize);
      mouse.removeEventListener("change", dock);
      reducedMotion.removeEventListener("change", dock);
    };
  }, []);
  return <div ref={badge} className="processing-cursor" data-provider={provider} aria-hidden="true">
    <span className="processing-cursor-orbit">
      <span className="processing-cursor-ring" />
      <span className="processing-cursor-ring processing-cursor-ring-inner" />
      <ProviderMark provider={provider} />
    </span>
    <span className="processing-cursor-copy"><strong>{provider}</strong><span>{actions[id] || "Getting ready"}</span></span>
  </div>;
}
