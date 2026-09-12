"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LanguageSelect } from "@/components/LanguageSelect";
import { apiGet, startPipeline } from "@/lib/coaching-api";
import { recordingOptions, recordingFilename, clockTime, MAX_RECORDING_SECONDS, MAX_UPLOAD_BYTES } from "@/lib/recording";
import { useEffect, useRef, useState } from "react";
import { LAYERS, countLandmarks, drawLandmarks } from "./drawLandmarks";
import { useLandmarkStream } from "./useLandmarkStream";
import { useWebcam } from "./useWebcam";
import { pipelineUserId } from "@/lib/session";
import { useRequireUser } from "@/lib/useUser";

export default function StreamingPage() {
  useRequireUser();   // 로그인 없으면 /login 으로
  const router = useRouter();
  const { videoRef, status: cameraStatus, error: cameraError, start: startCamera, stop: stopCamera } = useWebcam();
  const [language, setLanguage] = useState("en");
  const [scriptStyle, setScriptStyle] = useState("presentation");
  const [recordError, setRecordError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [landmarksAvailable, setLandmarksAvailable] = useState(false);
  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const alive = useRef(true);
  const error = recordError || cameraError;
  const live = cameraStatus === "live";
  const { status: serverStatus, result, stats } = useLandmarkStream(videoRef, live && landmarksAvailable);

  const canvasRef = useRef(null);
  const [maskOn, setMaskOn] = useState(true);
  const [layers, setLayers] = useState({ pose: true, face: true, hands: true });

  useEffect(() => {
    alive.current = true;
    apiGet("/capabilities").then(data => {if(alive.current) setLandmarksAvailable(Boolean(data.landmarks));}).catch(()=>{});
    return () => {
      alive.current = false;clearInterval(timerRef.current);
      if(recorderRef.current){recorderRef.current.onstop=null;if(recorderRef.current.state!=="inactive")recorderRef.current.stop();}
    };
  }, []);

  async function submitRecording(file) {
    setUploading(true);setRecordError("");
    try {
      if(!file.size) throw new Error("The recording was empty. Please try again.");
      if(file.size>MAX_UPLOAD_BYTES) throw new Error("Please upload a recording smaller than 100 MB.");
      const userId=pipelineUserId();
      const job=await startPipeline(file,userId,language,scriptStyle);
      localStorage.setItem("rehearse.lastRun",job.run_id);
      if(alive.current) router.push(`/evaluation?run=${job.run_id}`);
    } catch(e) {
      if(alive.current){setRecordError(e.message);setUploading(false);}
      busyRef.current=false;
    }
  }

  async function beginRecording() {
    if(busyRef.current) return;
    busyRef.current=true;setRecordError("");setSeconds(0);
    const media=await startCamera();
    if(!media){busyRef.current=false;return;}
    try {
      if(!window.MediaRecorder) throw new Error("This browser does not support recording. Upload a video instead.");
      const rec=new MediaRecorder(media,recordingOptions(MediaRecorder));
      const chunks=[];recorderRef.current=rec;
      rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      rec.onerror=()=>{rec.onstop=null;stopCamera();clearInterval(timerRef.current);busyRef.current=false;setRecordError("Recording was interrupted. Please try again.");};
      rec.onstop=()=>{
        clearInterval(timerRef.current);stopCamera();
        if(!alive.current)return;
        const type=rec.mimeType||chunks[0]?.type||"video/webm";
        submitRecording(new File(chunks,recordingFilename(type),{type}));
      };
      rec.start(1000);const started=Date.now();
      timerRef.current=setInterval(()=>{
        const elapsed=Math.floor((Date.now()-started)/1000);setSeconds(elapsed);
        if(elapsed>=MAX_RECORDING_SECONDS && rec.state==="recording"){setUploading(true);rec.stop();clearInterval(timerRef.current);}
      },250);
    } catch(e){stopCamera();busyRef.current=false;setRecordError(e.message);}
  }

  function stopRecording(){
    if(recorderRef.current?.state==="recording"){setUploading(true);recorderRef.current.stop();clearInterval(timerRef.current);}
  }

  async function uploadRecording(event){
    const file=event.target.files?.[0];event.target.value="";
    if(!file||busyRef.current)return;
    busyRef.current=true;await submitRecording(file);
  }

  function syncCanvasSize() {
    const video = videoRef.current;
    if(!video || !canvasRef.current) return;
    canvasRef.current.width = video.videoWidth;
    canvasRef.current.height = video.videoHeight;
  }

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) drawLandmarks(ctx, maskOn ? result : null, layers);
  }, [result, layers, maskOn]);

  const counts = countLandmarks(result);
  const nothingDetected =
    serverStatus === "connected" && result && !counts.pose && !counts.face && !counts.hands;

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="Back to home"
              className="grid size-9 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeftIcon />
            </Link>
            <div>
              <h1 className="text-base font-semibold leading-tight">Live Session</h1>
              <p className="text-xs text-slate-500">Camera, microphone &amp; delivery feedback</p>
            </div>
          </div>
          <nav className="flex items-center gap-4 text-xs font-medium text-slate-500" aria-label="Studio pages"><Link href="/streaming" className="text-primary" aria-current="page">Live Session</Link><Link href="/evaluation">Evaluation</Link><Link href="/practice">Voice Practice</Link></nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="lg:col-span-2"><LanguageSelect value={language} onChange={setLanguage} scriptStyle={scriptStyle} onScriptStyleChange={setScriptStyle} disabled={live || uploading || cameraStatus === "starting"} /></div>
        {/* ---------- Camera stage ---------- */}
        <section className="relative aspect-video overflow-hidden rounded-3xl bg-slate-950 shadow-lg shadow-slate-900/10">
          {/* Mirrored like a selfie view; video and mask flip together so they stay aligned */}
          <div className="absolute inset-0 -scale-x-100">
            <video
              ref={videoRef}
              onLoadedMetadata={syncCanvasSize}
              playsInline
              muted
              aria-label="Live camera preview"
              className={`size-full object-contain transition-opacity duration-500 ${live ? "opacity-100" : "opacity-0"}`}
            />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 size-full object-contain"
            />
          </div>

          {!live && (
            <EmptyState starting={cameraStatus === "starting"} uploading={uploading} error={error} onStart={beginRecording} />
          )}

          {live && (
            <>
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold tracking-wide text-white backdrop-blur">
                <span className="size-2 animate-pulse rounded-full bg-rose-500" />
                REC {clockTime(seconds)}
              </div>
              <div className="absolute right-4 top-4 rounded-full bg-black/40 px-3 py-1.5 font-mono text-xs text-white/90 backdrop-blur">
                {landmarksAvailable ? `${Math.round(stats.fps)} fps · ${Math.round(stats.latency)} ms` : "Camera + microphone · 01:30 max"}
              </div>

              <div className="absolute inset-x-0 bottom-3 flex justify-center sm:bottom-5">
                <div className="flex items-center gap-1.5 rounded-full bg-black/45 p-1 backdrop-blur-md sm:p-1.5">
                  <button
                    disabled={!landmarksAvailable}
                    onClick={() => setMaskOn((v) => !v)}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                      maskOn ? "bg-primary text-white hover:bg-primary-hover" : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    <SparkIcon />
                    Mask {maskOn ? "on" : "off"}
                  </button>
                  <button
                    onClick={stopRecording}
                    disabled={uploading}
                    className="flex items-center gap-2 rounded-full bg-rose-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-600 sm:px-4 sm:py-2 sm:text-sm"
                  >
                    <StopIcon />
                    Stop &amp; analyze
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ---------- Side panel ---------- */}
        <aside className="flex flex-col gap-4">
          <Card
            title="Overlay"
            action={<Switch checked={maskOn && landmarksAvailable} onChange={setMaskOn} label="Show mask" disabled={!landmarksAvailable}/>}
          >
            <ul className={`flex flex-col gap-1 transition-opacity ${maskOn ? "" : "opacity-40"}`}>
              {Object.entries(LAYERS).map(([key, { label, color }]) => (
                <li key={key} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
                  <span className="size-3 rounded-full ring-4 ring-slate-100" style={{ background: color }} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-slate-500">
                      {counts[key]
                        ? `${counts[key]} ${key === "hands" ? (counts[key] > 1 ? "hands" : "hand") : "points"}`
                        : "Not detected"}
                    </p>
                  </div>
                  <Switch
                    checked={layers[key]}
                    onChange={(v) => setLayers((l) => ({ ...l, [key]: v }))}
                    label={`Show ${label}`}
                    disabled={!maskOn || !landmarksAvailable}
                  />
                </li>
              ))}
            </ul>
            {!landmarksAvailable && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Live overlays are unavailable. You can still record and get delivery feedback after your session.</p>}
            {nothingDetected && (
              <p className="mt-3 rounded-xl bg-primary/5 px-3 py-2 text-xs text-primary">
                Server is connected but returned no landmarks yet.
              </p>
            )}
          </Card>

          <Card title="Session">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Inference" value={live && landmarksAvailable ? Math.round(stats.fps) : "—"} unit="fps" />
              <Stat label="Latency" value={live && landmarksAvailable ? Math.round(stats.latency) : "—"} unit="ms" />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
              <span>Recording limit</span>
              <code className="rounded-md bg-slate-100 px-2 py-1 font-mono text-slate-700">
                90 seconds
              </code>
            </div>
          </Card>
          <Card title="Have a recording?"><p className="mb-3 text-xs leading-5 text-slate-500">Upload a video with microphone audio to run the same analysis.</p><button className="button secondary-button w-full" disabled={live || uploading || cameraStatus === "starting"} onClick={()=>inputRef.current?.click()}>Upload a recording</button><input ref={inputRef} type="file" className="visually-hidden" accept="video/mp4,video/webm,video/quicktime,.mov,.mkv" onChange={uploadRecording} aria-label="Upload a recording"/></Card>
        </aside>
      </main>
    </div>
  );
}

function EmptyState({ starting, uploading, error, onStart }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,#132f6b_0%,#020617_75%)] px-6">
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="grid size-16 place-items-center rounded-2xl bg-primary/15 text-[#8fb4ff] ring-1 ring-primary/40">
          <CameraIcon />
        </div>
        <div>
          <p className="text-lg font-semibold text-white">
            {uploading ? "Uploading your recording…" : starting ? "Starting camera…" : "Ready when you are"}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Record your camera and microphone, then stop to get your evaluation.
          </p>
        </div>
        {error && (
          <p role="alert" aria-label="Recording error" className="max-w-sm rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/30">
            {error}
          </p>
        )}
        <button
          onClick={onStart}
          disabled={starting || uploading}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {uploading ? "Please wait…" : error ? "Try again" : "Start recording"}
        </button>
      </div>
    </div>
  );
}

function Card({ title, action, children }) {
  return (
    <div className="rounded-2xl bg-[#f5f5f7] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, unit }) {
  return (
    <div className="rounded-xl bg-white px-3 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {value}
        <span className="ml-1 text-xs font-medium text-slate-400">{unit}</span>
      </p>
    </div>
  );
}

function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed ${
        checked ? "bg-primary" : "bg-slate-200"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : ""
        }`}
      />
    </button>
  );
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function ArrowLeftIcon() {
  return (
    <svg {...iconProps}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg {...iconProps} width={28} height={28}>
      <path d="M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14" />
      <rect x="3" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg {...iconProps} width={16} height={16}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg {...iconProps} width={16} height={16}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
