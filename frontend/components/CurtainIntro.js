"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { ArrowDown, ArrowDownRight } from "lucide-react";

const GLINTS = [[8,24],[19,69],[28,16],[38,78],[48,34],[58,13],[69,70],[78,29],[88,58],[94,18]];

export default function CurtainIntro() {
  const intro = useRef(null);

  useEffect(() => {
    const node = intro.current;
    let frame = 0;
    const update = () => {
      frame = 0;
      const progress = Math.min(1, Math.max(0, -node.getBoundingClientRect().top / node.offsetHeight));
      node.style.setProperty("--intro-progress", String(progress));
      node.dataset.offscreen = String(progress >= 1);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
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
        <div className="curtain-fabric">
          <svg viewBox="0 0 1600 1000" preserveAspectRatio="none" focusable="false">
            <defs>
              <linearGradient id="curtain-silk" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#4b84df" stopOpacity=".07" />
                <stop offset=".2" stopColor="#70a0ed" stopOpacity=".45" />
                <stop offset=".38" stopColor="#f8fcff" stopOpacity=".88" />
                <stop offset=".5" stopColor="#b9d5ff" stopOpacity=".72" />
                <stop offset=".7" stopColor="#3f7cd9" stopOpacity=".25" />
                <stop offset=".9" stopColor="#6a9de4" stopOpacity=".12" />
                <stop offset="1" stopColor="#315fac" stopOpacity=".16" />
              </linearGradient>
              <filter id="curtain-wave" x="-10%" y="-10%" width="120%" height="120%">
                <feTurbulence type="fractalNoise" baseFrequency=".006 .003" numOctaves="1" seed="4" result="ripple" />
                <feDisplacementMap in="SourceGraphic" in2="ripple" scale="24" xChannelSelector="R" yChannelSelector="G" />
              </filter>
            </defs>
            <g filter="url(#curtain-wave)">
              {Array.from({ length: 15 }, (_, i) => {
                const x = i * 125 - 100;
                return <path key={i} className="curtain-fold" style={{ "--fold-delay": `${-i * .8}s`, "--fold-time": `${9 + i % 4}s` }}
                  d={`M${x-80},-120 C${x+90},160 ${x-150},510 ${x+12},1120 L${x+190},1120 C${x+90},750 ${x+200},280 ${x+70},-120 Z`}
                  fill="url(#curtain-silk)" />;
              })}
            </g>
          </svg>
          <div className="curtain-lustre" />
          {GLINTS.map(([x,y],i)=><i key={i} className="curtain-glint" style={{ left:`${x}%`,top:`${y}%`,animationDelay:`${i * .57}s` }}/>) }
        </div>
      </div>
      <div className="curtain-topline">
        <Image src="/optune-logo.png" width={1326} height={680} alt="Optune" priority className="curtain-logo" />
        <a href="#studio-content" onClick={enter} className="curtain-skip">Enter studio <ArrowDownRight size={15} aria-hidden="true" /></a>
      </div>
      <div className="curtain-quote-wrap">
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
