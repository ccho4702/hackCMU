"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Camera, FileVideo, Sparkles } from "lucide-react";
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
          <div className="absolute inset-x-20 bottom-20 p-8 text-white">
            <div className="text-[20px] font-bold">
              Presently <br/>
              <br/>
            </div>
            <div className="text-[14px]">
              Optimize to Your Best Version of Speech
            </div>
          </div>
        </div>
        <Link href="/live">
          <div className="rounded-2xl bg-white shadow-lg mt-5 p-8">
            Start Recording
          </div>
        </Link>
      </div>
    </PageShell>
  );
}
