"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Camera, Mic } from "lucide-react";
import { Card, PageShell } from "@/components/ui/studio";
import { UploadPanel } from "@/components/upload/UploadPanel";

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    const run = new URLSearchParams(window.location.search).get("run");
    if (run && /^[a-f0-9]{32}$/.test(run)) router.replace(`/evaluation?run=${run}`);
  }, [router]);
  const [mode, setMode] = useState("choose");

  return (
    <PageShell>
      <div className="flex flex-col w-full">
        <div className="relative overflow-hidden rounded-2xl">
          <video 
            src="/banner1.mov"
            autoPlay
            muted
            loop
            playsInline
            className="w-full rounded-2xl"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent"/>
          <div className="absolute inset-0 flex flex-col justify-end p-5 text-white sm:p-10 lg:p-14">
            <span className="h-1 w-10 rounded-full bg-white sm:w-14" />
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-shadow-lg sm:mt-5 sm:text-6xl lg:text-7xl">
              Presently
            </h1>
            <p className="mt-1 max-w-md text-sm font-medium text-shadow-md sm:mt-3 sm:text-lg lg:text-xl">
              Optimize to Your Best Version of Speech
            </p>
          </div>
        </div>
        <HomeCard
          href="/live"
          icon={<Camera className="size-6" />}
          eyebrow="Live session"
          live
          title="Start Recording"
          description="Turn on your camera and get real-time feedback on your delivery."
        />
        <HomeCard
          href="/practice"
          icon={<Mic className="size-6" />}
          eyebrow="Voice practice"
          tone="navy"
          title="Practice Your Next Take"
          description="Read your improved script along with your own reference voice, then compare pronunciation, pace, and rhythm on every trial."
        />
      </div>
    </PageShell>
  );
}

// Accent colors per card (full class names so Tailwind picks them up).
const TONES = {
  primary: {
    card: "hover:ring-primary/40",
    icon: "bg-primary/10 text-primary group-hover:bg-primary",
    dot: "bg-primary",
    arrow: "bg-primary",
  },
  navy: {
    card: "hover:ring-blue-900/40",
    icon: "bg-blue-900/10 text-blue-900 group-hover:bg-blue-900",
    dot: "bg-blue-900",
    arrow: "bg-blue-900",
  },
};

function HomeCard({ href, icon, eyebrow, live = false, tone = "primary", title, description }) {
  const colors = TONES[tone];
  return (
    <Link
      href={href}
      className={`group mt-5 flex items-center gap-4 rounded-2xl bg-[#f5f5f7] p-5 transition hover:ring-1 duration-200 hover:-translate-y-0.5 sm:gap-6 sm:p-8 ${colors.card}`}
    >
      <span
        className={`grid size-12 shrink-0 place-items-center rounded-2xl transition-colors group-hover:text-white sm:size-14 ${colors.icon}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <span
            className={`size-1.5 rounded-full ${live ? "animate-pulse bg-primary" : colors.dot}`}
          />
          {eyebrow}
        </span>
        <span className="mt-1 block text-lg font-semibold sm:text-xl">{title}</span>
        <span className="mt-1 block text-sm text-slate-500">{description}</span>
      </span>
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-full text-white transition-transform group-hover:translate-x-1 sm:size-12 ${colors.arrow}`}
      >
        <ArrowRight className="size-5" />
      </span>
    </Link>
  );
}
