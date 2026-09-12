"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import StudioHeader from "@/components/StudioHeader";
import { apiGet } from "@/lib/api";
import { timestampSeconds } from "@/lib/recording";

const STAGES = [["prepare","Preparing recording"],["nonverbal_analysis","Reviewing delivery"],["transcription","Transcribing speech"],["script_analysis","Improving your script"],["speech_generation","Generating reference voice"]];
export default function Evaluation() {
  const [job,setJob] = useState(null);
  const [error,setError] = useState("");
  const [tab,setTab] = useState("improved");
  const player = useRef(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("run") || localStorage.getItem("rehearse.lastRun");
    const controller = new AbortController();
    let timer;
    async function poll() {
      if (!id || !/^[a-f0-9]{32}$/.test(id)) { setError("Start a live session or upload a recording to see your evaluation."); return; }
      try {
        const data = await apiGet(`/runs/${id}`,{signal:controller.signal});
        if(controller.signal.aborted) return;
        setJob(data);setError("");localStorage.setItem("rehearse.lastRun",id);
        if(["success","failed"].includes(data.status)) return;
      } catch(e) { if(controller.signal.aborted) return;setError(`Could not load the evaluation. ${e.message}`); }
      timer=setTimeout(poll,2500);
    }
    poll();
    return ()=>{controller.abort();clearTimeout(timer);};
  },[]);
  function seek(time) { if(player.current){player.current.currentTime=timestampSeconds(time);player.current.play().catch(()=>{});} }
  const feedback=job?.results?.nonverbal_feedback;
  const script=job?.results?.script_feedback;
  const transcript=job?.results?.transcript?.text || script?.original_script;
  const working=job && !["success","failed"].includes(job.status);
  const stage=STAGES.findIndex(([id])=>id===job?.stage);
  return <div className="studio-app"><StudioHeader title="Evaluation" subtitle="Your recording, feedback, and next take" active="evaluation" runId={job?.run_id}><span className={`status-pill ${working ? "pending" : job?.status === "success" ? "ok" : ""}`}><i/>{working ? "Processing" : job?.status === "success" ? "Complete" : "Ready"}</span></StudioHeader><main className="studio-container evaluation-layout">
    {error && <div className="error-banner" role="alert"><p>{error}</p><Link className="button secondary-button" href="/streaming">Go to Streaming</Link></div>}
    {!job && !error && <div className="panel loading-panel"><span className="spinner"/>Loading your evaluation…</div>}
    {job && <>
      <div className="evaluation-intro"><div><span className="blue-eyebrow">SESSION REVIEW</span><h2>Your next take starts here.</h2></div><Link href="/streaming" className="button secondary-button">New recording</Link></div>
      {working && <section className="panel progress-card" aria-live="polite"><div className="progress-heading"><span className="spinner"/><div><h2>{STAGES[stage]?.[1] || "Your recording is queued"}</h2><p>Completed results appear below as each stage finishes.</p></div></div><ol className="stage-list">{STAGES.map(([id,title],i)=><li key={id} className={i===stage?"active":i<stage?"done":""}><span>{i<stage?"✓":i+1}</span>{title}</li>)}</ol></section>}
      {job.status === "failed" && <div className="error-banner" role="alert"><div><strong>This session could not finish.</strong><p>{job.error_message || "Available results are preserved below."}</p></div><Link className="button secondary-button" href="/streaming">Try a new recording</Link></div>}
      <div className="evaluation-grid"><section className="panel original-card"><div className="card-heading"><h2>Original recording</h2><span className="count-pill">CAMERA + AUDIO</span></div><video ref={player} controls playsInline preload="metadata" src={job.original_video_url} aria-label="Original recording"/></section><section className="panel feedback-card"><div className="card-heading"><h2>Delivery notes</h2>{feedback && <span className="count-pill">{feedback.length} moments</span>}</div><p className="card-description">Select a timestamp to review your gaze, gestures, or posture.</p><div className="feedback-list">{feedback ? feedback.length ? feedback.map((item,i)=><article key={i} className="feedback-item"><button className="time-link" onClick={()=>seek(item.start_time)}>▷ {item.start_time.slice(0,5)} – {item.end_time.slice(0,5)}</button><p>{item.content}</p></article>) : <p className="empty-result">No clear nonverbal issues were flagged.</p> : <p className="muted">Your delivery feedback is being prepared.</p>}</div></section></div>
      <section className="panel script-card"><div className="card-heading"><h2>Script review</h2>{job.outputs?.improved_script && <a className="text-button" href={job.outputs.improved_script} download>Download script ↓</a>}</div><div className="script-tabs" role="tablist" aria-label="Script version"><button role="tab" aria-selected={tab==="original"} onClick={()=>setTab("original")}>Original transcript</button><button role="tab" aria-selected={tab==="improved"} onClick={()=>setTab("improved")}>Improved script</button></div><div className="script-body" role="tabpanel" aria-label={tab==="original"?"Original transcript":"Improved script"}>{tab==="original" ? transcript || "Your transcript will appear here." : script?.improved_script || "Your improved script will appear here."}</div>{script?.issues?.length>0 && <details className="script-changes"><summary>{script.issues.length} script improvements</summary>{script.issues.map((item,i)=><article key={i} className="script-issue"><q>{item.original}</q><p>{item.problem}</p><p className="suggestion">↳ {item.suggestion}</p></article>)}</details>}</section>
      <section className="panel audio-card"><div><span className="blue-eyebrow">REFERENCE VOICE</span><h2>Hear your improved script.</h2><p>Listen to the revised presentation in your reference voice.</p></div>{job.outputs?.tts_audio ? <div className="audio-player"><audio controls src={job.outputs.tts_audio} preload="metadata" aria-label="Improved speech"/><a className="text-button" href={job.outputs.tts_audio} download>Download audio ↓</a></div> : <p className="muted">{job.status==="failed"?"Reference audio is not available for this session.":"Your audio will appear here when it’s ready."}</p>}</section>
      {job.outputs?.tts_audio && <section className="practice-cta"><div><h3>Ready for your next trial?</h3><p>Follow word timing and compare your voice with this reference.</p></div><Link className="button primary-button" href={`/practice?run=${job.run_id}`}>Practice this script →</Link></section>}
      <p className="results-note">Review the transcript, especially names and technical terms. Feedback is a practice reference, not a measure of overall speaking ability.</p>
    </>}
  </main></div>;
}
