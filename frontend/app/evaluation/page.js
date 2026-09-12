"use client";

import { coachingStorage } from "@/lib/session";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ProviderProgress from "@/components/ProviderProgress";
import { PROCESSING_STAGES, processingStage } from "@/lib/processing-stages";
import DeliveryFeedback from "@/components/DeliveryFeedback";
import ReferenceVoice from "@/components/ReferenceVoice";
import StudioHeader from "@/components/StudioHeader";
import { scriptStyleLabel } from "@/lib/script-styles";
import { apiGet } from "@/lib/coaching-api";
import { timestampSeconds } from "@/lib/recording";


export default function Evaluation() {
  const [job,setJob] = useState(null);
  const [analysisId,setAnalysisId] = useState(null);
  const [error,setError] = useState("");
  const player = useRef(null);
  useEffect(() => {
    const storage = coachingStorage();
    const id = new URLSearchParams(window.location.search).get("run") || storage.getItem("rehearse.lastRun");
    const parentAnalysis = new URLSearchParams(window.location.search).get("analysis");
    const controller = new AbortController();
    let timer;
    async function poll() {
      if (!id || !/^[a-f0-9]{32}$/.test(id)) { setError("Start a live session or upload a recording to see your evaluation."); return; }
      try {
        const data = await apiGet(`/runs/${id}`,{signal:controller.signal});
        if(controller.signal.aborted) return;
        setJob(data);setAnalysisId(parentAnalysis && /^anl_[a-zA-Z0-9_]+$/.test(parentAnalysis) ? parentAnalysis : null);setError("");storage.setItem("rehearse.lastRun",id);
        if(["success","failed"].includes(data.status)) return;
      } catch(e) { if(controller.signal.aborted) return;setError(`Could not load the evaluation. ${e.message}`); }
      timer=setTimeout(poll,2500);
    }
    poll();
    return ()=>{controller.abort();clearTimeout(timer);};
  },[]);
  function seek(time) { if(player.current){player.current.currentTime=timestampSeconds(time);player.current.play().catch(()=>{});} }
  const feedback=job?.results?.nonverbal_feedback;
  const vocalFeedback=job?.results?.vocal_feedback;
  const script=job?.results?.script_feedback;
  const transcript=job?.results?.transcript?.text || script?.original_script;
  const working=job && !["success","failed"].includes(job.status);
  const stage=PROCESSING_STAGES.findIndex(item=>item.id===job?.stage);
  const currentStage=processingStage(job?.stage);
  return <div className="studio-app"><StudioHeader title="Evaluation" subtitle="Your recording, feedback, and next take" active="evaluation" runId={job?.run_id}/><main className="studio-container evaluation-layout">
    {error && <div className="error-banner" role="alert"><p>{error}</p><Link className="button secondary-button" href="/live">Start live analysis</Link></div>}
    {!job && !error && <div className="panel loading-panel"><span className="spinner"/>Loading your evaluation…</div>}
    {job && <>
      <section className="evaluation-intro"><div>{analysisId && <Link className="text-button" href={`/analysis/${analysisId}`}>← Back to facial metrics</Link>}<span className="blue-eyebrow">Evaluation</span><h2>How you look, sound, and speak.</h2><ul className="evaluation-tags" aria-label="What this session reviews"><li>Delivery</li><li>Pronunciation</li><li>Script</li></ul></div><Link href="/live" className="button secondary-button">New recording</Link></section>
      {working && <section className="pipeline-progress" aria-label="Processing your recording">
        <ProviderProgress {...currentStage} announce />
        <ol className="pipeline-stage-list">{PROCESSING_STAGES.map((item,i)=><li key={item.id} className={i===stage?"active":i<stage?"done":""} aria-current={i===stage?"step":undefined}><span>{i<stage?"✓":i+1}</span>{item.label}</li>)}</ol>
      </section>}
      {job.status === "failed" && <div className="error-banner" role="alert"><div><strong>This session could not finish.</strong><p>{job.error_message || "Available results are preserved below."}</p></div><Link className="button secondary-button" href="/live">Try a new recording</Link></div>}
      <div className="evaluation-grid">
        <section className="panel original-card"><div className="card-heading"><h2>Original recording</h2><span className="count-pill">CAMERA + AUDIO</span></div><video ref={player} controls playsInline preload="metadata" src={job.original_video_url} aria-label="Original recording"/></section>
        <div className="delivery-sections">
          <DeliveryFeedback title="Nonverbal delivery" tone="nonverbal" description="Gaze, gestures, posture, and body movement." items={feedback} pending={working} progress={working&&job.stage==="nonverbal_analysis"?{...currentStage,title:"Reviewing your nonverbal delivery",detail:"Gaze, gestures and body movement."}:null} onSeek={seek} />
          <DeliveryFeedback title="Vocal delivery" tone="vocal" description="Intonation, loudness, pace, pauses, and articulation." items={vocalFeedback} pending={working} progress={working&&job.stage==="nonverbal_analysis"?{...currentStage,title:"Listening to your vocal delivery",detail:"Pace, pauses and expression."}:null} onSeek={seek} />
        </div>
      </div>
      <ReferenceVoice key={job.outputs?.tts_audio || "pending"} src={job.outputs?.tts_audio} failed={job.status === "failed"} progress={working&&["voice_cloning","speech_generation"].includes(job.stage)?currentStage:null} waitingForScript={working&&!script} />
      <section className="panel script-card">
        <div className="card-heading"><div className="script-review-heading"><h2>Transcript</h2><span>{scriptStyleLabel(job.script_style)}</span></div>{job.outputs?.improved_script && <a className="text-button" href={job.outputs.improved_script} download>Download revised script ↓</a>}</div>
        <div className="script-comparison">
          <section className="script-version script-version-improved" aria-labelledby="improved-script-title">
            <h3 id="improved-script-title">Improved script</h3>
            <div className="script-copy">{script?.improved_script || (working&&job.stage==="script_analysis"?<ProviderProgress {...currentStage} compact />:"Your improved script will appear here.")}</div>
          </section>
          <section className="script-version script-version-original" aria-labelledby="original-script-title">
            <h3 id="original-script-title">Original script</h3>
            <div className="script-copy">{transcript || (working&&job.stage==="transcription"?<ProviderProgress {...currentStage} compact />:"Your transcript will appear here.")}</div>
          </section>
        </div>
        {script?.issues?.length>0 && <details className="script-changes"><summary>{script.issues.length} script improvements</summary>{script.issues.map((item,i)=><article key={i} className="script-issue"><q>{item.original}</q><p>{item.problem}</p><p className="suggestion">↳ {item.suggestion}</p></article>)}</details>}
      </section>
      {job.outputs?.tts_audio && <section className="practice-cta"><div><h3>Ready for your next trial?</h3><p>Follow word timing and compare your voice with this reference.</p></div><Link className="button primary-button" href={`/practice?run=${job.run_id}`}>Practice this script →</Link></section>}
      <p className="results-note">Review the transcript, especially names and technical terms. Feedback is a practice reference, not a measure of overall speaking ability.</p>
    </>}
  </main></div>;
}
