"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { ArrowDown, ArrowDownRight } from "lucide-react";

export default function CurtainIntro() {
  const intro = useRef(null);
  const quote = useRef(null);
  const fabric = useRef(null);

  useEffect(() => {
    const node = intro.current;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previousTime = 0;
    let current = 0;
    let target = 0;
    let top = node.offsetTop;
    let height = node.offsetHeight;

    const paint = () => {
      // Only compositor properties change; no inherited CSS variables or SVG redraws.
      quote.current.style.transform = motion.matches ? "none" : `translate3d(0,${-current * 26}px,0)`;
      quote.current.style.opacity = motion.matches ? "1" : String(Math.max(0, 1 - current * 1.35));
      fabric.current.style.transform = motion.matches ? "none" : `translate3d(0,${current * 48}px,0)`;
    };
    const tick = (now) => {
      const dt = Math.min(64, previousTime ? now - previousTime : 16);
      previousTime = now;
      current += (target - current) * (1 - Math.exp(-dt / 110));
      if (Math.abs(target - current) < .0005) current = target;
      paint();
      frame = current === target ? 0 : requestAnimationFrame(tick);
      if (!frame) previousTime = 0;
    };
    const schedule = () => {
      target = Math.min(1, Math.max(0, (window.scrollY - top) / height));
      node.dataset.offscreen = String(target >= 1);
      if (motion.matches) { current = target; paint(); return; }
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const resize = () => { top = node.offsetTop; height = node.offsetHeight; schedule(); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", resize);
    motion.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", resize);
      motion.removeEventListener("change", schedule);
    };
  }, []);

  function enter(event) {
    const studio = document.getElementById("studio-content");
    if (!studio) return;
    event.preventDefault();
    studio.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    studio.focus({ preventScroll: true });
  }

  return (
    <section ref={intro} className="curtain-intro" aria-labelledby="curtain-intro-title">
      <div className="curtain-arrival" aria-hidden="true">
        <div ref={fabric} className="curtain-parallax"><div className="curtain-fabric">
          <svg viewBox="0 0 1600 1000" preserveAspectRatio="none" focusable="false">
            <defs>
              <linearGradient id="curtain-silk" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#4b84df" stopOpacity="0" />
                <stop offset=".2" stopColor="#70a0ed" stopOpacity=".3" />
                <stop offset=".38" stopColor="#f8fcff" stopOpacity=".65" />
                <stop offset=".5" stopColor="#b9d5ff" stopOpacity=".52" />
                <stop offset=".7" stopColor="#3f7cd9" stopOpacity=".16" />
                <stop offset=".9" stopColor="#6a9de4" stopOpacity=".12" />
                <stop offset="1" stopColor="#315fac" stopOpacity="0" />
              </linearGradient>

            </defs>
            <g>
              {Array.from({ length: 10 }, (_, i) => {
                const x = i * 185 - 100;
                return <path key={i} className="curtain-fold"
                  d={`M${x-80},-120 C${x+90},160 ${x-150},510 ${x+12},1120 L${x+235},1120 C${x+120},750 ${x+245},280 ${x+115},-120 Z`}
                  fill="url(#curtain-silk)" />;
              })}
            </g>
          </svg>
          <div className="curtain-lustre" />
        </div></div>
      </div>
      <div className="curtain-topline">
        <Image src="/optune-logo.png" width={1326} height={680} alt="Optune" priority className="curtain-logo" />
        <a href="#studio-content" onClick={enter} className="curtain-skip">Enter studio <ArrowDownRight size={15} aria-hidden="true" /></a>
      </div>
      <div ref={quote} className="curtain-quote-wrap">
        <h1 id="curtain-intro-title">
          <span className="curtain-line"><span>You can&apos;t <em>optimize</em></span></span>
          <span className="curtain-line"><span>what you can&apos;t <em>measure.</em></span></span>
        </h1>
      </div>
      <a href="#studio-content" className="curtain-scroll" onClick={enter}>
        <span>SCROLL TO EXPLORE</span><ArrowDown size={22} strokeWidth={1.2} aria-hidden="true" />
      </a>
    </section>
  );
}
