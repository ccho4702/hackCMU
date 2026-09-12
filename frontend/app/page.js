"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Camera } from "lucide-react";
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
        <Link
          href="/live"
          className="group mt-5 flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/10 hover:ring-primary/40 sm:gap-6 sm:p-8"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-colors group-hover:bg-primary group-hover:text-white sm:size-14">
            <Camera className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span className="size-1.5 animate-pulse rounded-full bg-rose-500" />
              Live session
            </span>
            <span className="mt-1 block text-lg font-semibold sm:text-xl">Start Recording</span>
            <span className="mt-1 block text-sm text-slate-500">
              Turn on your camera and get real-time feedback on your delivery.
            </span>
          </span>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition-transform group-hover:translate-x-1 sm:size-12">
            <ArrowRight className="size-5" />
          </span>
        </Link>
      </div>
    </PageShell>
  );
}
