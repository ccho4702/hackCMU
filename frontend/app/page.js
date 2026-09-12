"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import StudioHeader from "@/components/StudioHeader";

export default function Home() {
  const [runId, setRunId] = useState(null);
  useEffect(() => { Promise.resolve().then(() => {
    const id = new URLSearchParams(window.location.search).get("run") || localStorage.getItem("rehearse.lastRun");
    if (id && /^[a-f0-9]{32}$/.test(id)) setRunId(id);
  }); }, []);
  const query = runId ? `?run=${runId}` : "";
  return <div className="studio-app"><StudioHeader title="Presentation Studio" subtitle="Record, review, and practice" runId={runId}/><main className="studio-container home-content"><span className="blue-eyebrow">HACKCMU 2026</span><h2>Make your next presentation<br/>your strongest one.</h2><p>Start a live session, get feedback on your delivery, and practice your improved script in your own voice.</p><Link className="button primary-button" href="/streaming">Go to Streaming <span>→</span></Link><div className="home-cards">{[["01", "Live Session", "Record camera and microphone together. Stop when you’re ready to get feedback.", "/streaming", "Start a session"], ["02", "Evaluation", "Review your original recording, delivery notes, transcript, and improved script.", `/evaluation${query}`, "Open evaluation"], ["03", "Voice Practice", "Follow word timing, record another take, and compare five speech measures.", `/practice${query}`, "Practice a script"]].map(([step,title,copy,href,label]) => <section className="panel" key={step}><span className="step-number">{step}</span><h3>{title}</h3><p>{copy}</p><Link href={href}>{label} →</Link></section>)}</div>{!runId && <p className="muted">Your evaluation and practice results will appear after your first recording.</p>}</main></div>;
}
