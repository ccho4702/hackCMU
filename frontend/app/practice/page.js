"use client";

import { useEffect, useRef, useState } from "react";
import StudioHeader from "@/components/StudioHeader";
import Link from "next/link";
import { apiGet, apiPost, apiUpload } from "@/lib/coaching-api";
import { useRequireUser } from "@/lib/useUser";
import { clockTime, recordingError } from "@/lib/recording";
import { activeWordAt, audioProgress, audioRecordingOptions, scoreLabel, SCORE_AXES } from "@/lib/practice";

export default function Practice() {
  useRequireUser();   // 로그인 없으면 /login 으로
  const [session, setSession] = useState(null);
  const [board, setBoard] = useState(null);   // GET /runs/{id}/leaderboard
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("idle");
  const [trial, setTrial] = useState(null);
  const [time, setTime] = useState(0);
  const [referenceDuration, setReferenceDuration] = useState(0);
  const [trialDuration, setTrialDuration] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [mode, setMode] = useState("reference");
  const [aligning, setAligning] = useState(false);
  const refAudio = useRef(null);
  const trialAudio = useRef(null);
  const stream = useRef(null);
  const recorder = useRef(null);
  const clock = useRef(null);
  const started = useRef(0);
  const mounted = useRef(true);
  const operating = useRef(false);
  const fileInput = useRef(null);
  const wordElements = useRef([]);

  const busy = ["requesting", "countdown", "recording", "uploading", "scoring"].includes(phase);
  const score = trial?.score;
  const validScore = trial?.status === "complete" && score?.status === "ok";
  const words = mode === "trial" ? (score?.words || []).filter(w => w.user?.t0 != null).map(w => ({ text: w.text, t0: w.user.t0, t1: w.user.t1 })) : session?.words || [];
  const active = activeWordAt(words, time);
  const next = words.findIndex(w => w.t0 > time);
  const totalDuration = mode === "trial" ? trialDuration || trial?.duration_seconds || 0 : referenceDuration || session?.duration_seconds || 0;
  const progress = audioProgress(time, totalDuration);
  const cue = active >= 0 ? words[active]?.text : next >= 0 ? words[next]?.text : time > 0 ? "Nice work." : "Ready?";

  function loadBoard(runId) {
    apiGet(`/runs/${runId}/leaderboard`).then(data => { if (mounted.current) setBoard(data); }).catch(() => {});
  }

  useEffect(() => {
    mounted.current = true;
    const runId = new URLSearchParams(window.location.search).get("run") || localStorage.getItem("rehearse.lastRun");
    const controller = new AbortController();
    Promise.resolve().then(async () => {
      if (!runId) throw new Error("Finish a rehearsal and generate its TTS audio first, then open Voice practice.");
      const data = await apiGet(`/runs/${runId}/practice`, { signal: controller.signal });
      if (!mounted.current) return;
      setSession(data);
      loadBoard(runId);
      const inProgress = data.trials.find(t => ["queued", "running"].includes(t.status));
      setTrial(inProgress || data.trials[0] || null);
      if (inProgress) { setPhase("scoring"); operating.current = true; }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => {
      mounted.current = false; controller.abort(); clearInterval(clock.current);
      if (recorder.current) { recorder.current.onstop = null; if (recorder.current.state !== "inactive") recorder.current.stop(); }
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  useEffect(() => {
    if (phase !== "scoring" || !trial?.trial_id || !session?.run_id) return;
    let timer, cancelled = false;
    const controller = new AbortController();
    async function poll() {
      try {
        const data = await apiGet(`/runs/${session.run_id}/trials/${trial.trial_id}`, { signal: controller.signal });
        if (cancelled) return;
        setTrial(data);
        if (["complete", "failed"].includes(data.status)) {
          if (data.status === "failed") setError(data.error_message);
          try {
            const updated = await apiGet(`/runs/${session.run_id}/practice`, { signal: controller.signal });
            if (!cancelled) { setSession(updated); loadBoard(session.run_id); }
          } finally {
            if (!cancelled) { setPhase("idle"); operating.current = false; }
          }
          return;
        }
      } catch (e) { if (!cancelled) setError(`Reconnecting to your saved trial… ${e.message}`); }
      if (!cancelled) timer = setTimeout(poll, 2000);
    }
    poll();
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [phase, trial?.trial_id, session?.run_id]);

  useEffect(() => {
    let frame;
    function tick() {
      const audio = mode === "reference" ? refAudio.current : trialAudio.current;
      if (phase !== "recording" && audio && !audio.paused) setTime(audio.currentTime);
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode, phase]);

  useEffect(() => {
    if (active >= 0) wordElements.current[active]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [active]);

  async function getTiming() {
    setAligning(true); setError("");
    try {
      const data = await apiPost(`/runs/${session.run_id}/practice/alignment`, {});
      setSession(old => ({ ...old, words: data.words, alignment_source: data.source }));
    } catch (e) { setError(e.message); }
    finally { setAligning(false); }
  }

  function releaseMic() {
    clearInterval(clock.current);
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  }

  async function submit(file) {
    operating.current = true; setPhase("uploading"); setError("");
    try {
      if (!file.size) throw new Error("Your recording is empty. Please try again.");
      if (file.size > 25 * 1024 * 1024) throw new Error("Keep your trial under 25 MB.");
      const created = await apiUpload(`/runs/${session.run_id}/trials`, file);
      if (mounted.current) { setTrial(created); setPhase("scoring"); }
    } catch (e) { if (mounted.current) { setError(e.message); setPhase("idle"); } operating.current = false; }
  }

  function stop() {
    if (recorder.current?.state === "recording") { recorder.current.stop(); clearInterval(clock.current); }
  }

  async function start() {
    if (operating.current || !session) return;
    operating.current = true; setPhase("requesting"); setError("");
    refAudio.current?.pause(); trialAudio.current?.pause(); setMode("reference"); setTime(0); setSeconds(0);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("Use a browser on localhost or HTTPS, or upload an audio recording.");
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!mounted.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      const rec = new MediaRecorder(media, audioRecordingOptions(MediaRecorder));
      recorder.current = rec;
      const chunks = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onerror = () => { rec.onstop = null; releaseMic(); operating.current = false; setPhase("idle"); setError("Recording was interrupted. Please try again."); };
      rec.onstop = () => {
        releaseMic();
        if (!mounted.current) return;
        const type = rec.mimeType || chunks[0]?.type || "audio/webm";
        submit(new File(chunks, `trial.${type.includes("mp4") ? "m4a" : "webm"}`, { type }));
      };
      setPhase("countdown");
      for (let i = 3; i > 0; i--) {
        setCountdown(i);
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!mounted.current) { releaseMic(); return; }
      }
      rec.start(500); started.current = performance.now(); setPhase("recording");
      clock.current = setInterval(() => {
        const elapsed = (performance.now() - started.current) / 1000;
        setTime(elapsed); setSeconds(elapsed);
        if (elapsed >= session.max_trial_seconds && rec.state === "recording") stop();
      }, 40);
    } catch (e) { releaseMic(); operating.current = false; setPhase("idle"); setError(recordingError(e).replaceAll("Camera or microphone", "Microphone")); }
  }

  async function upload(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || operating.current) return;
    refAudio.current?.pause(); trialAudio.current?.pause();
    await submit(file);
  }

  function listenFrom(index) {
    if (busy) return;
    const audio = mode === "trial" ? trialAudio.current : refAudio.current;
    if (audio && words[index]) { audio.currentTime = words[index].t0; setTime(audio.currentTime); audio.play().catch(() => {}); }
  }

  function chooseTrial(item) {
    if (busy) return;
    refAudio.current?.pause(); trialAudio.current?.pause(); setTrial(item); setTrialDuration(0); setTime(0); setMode("reference"); setError("");
  }

  return <div className="app-shell">
    <StudioHeader title="Voice Practice" subtitle="Follow your reference and improve each trial" active="practice" runId={session?.run_id}/>
    <main className="workspace practice-workspace">
      <section className="practice-intro"><p className="blue-eyebrow">VOICE PRACTICE / YOUR NEXT TAKE</p><h1>Practice your next take.</h1><p>Listen to your reference. Read the same script.<br/>See what changes with every try.</p></section>
      {error && <div className="error-banner" role="alert"><p>{error}</p></div>}
      {!session && !error && <p className="muted">Loading your script and reference voice…</p>}
      {session && <>
        <section className="practice-reference"><div><p className="eyebrow">YOUR TTS REFERENCE</p><h2>The voice to practice with</h2><p>{Math.round(session.duration_seconds)} seconds · same script, every trial</p></div><audio ref={refAudio} controls src={session.reference_audio_url} aria-label="TTS reference" onEnded={event => { setMode("reference"); setTime(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : session.duration_seconds); }} onDurationChange={event => setReferenceDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onPlay={() => { if (busy) { refAudio.current.pause(); return; } trialAudio.current?.pause(); setMode("reference"); setTime(refAudio.current.currentTime); }} onSeeked={() => { setMode("reference"); setTime(refAudio.current.currentTime); }}/></section>
        <div className="practice-grid">
          <section className="practice-script-card"><div className="card-heading"><div><span className="step-number">01</span><h2>Follow the script</h2></div><span className="count-pill">{mode === "trial" ? "YOUR TRIAL TIMING" : phase === "recording" ? "REFERENCE PACE GUIDE" : "REFERENCE TIMING"}</span></div>
            <div className={`word-cue ${phase === "recording" ? "guided" : ""}`} aria-live="off"><span>{phase === "countdown" ? "GET READY" : active >= 0 ? "NOW" : "UP NEXT"}</span><strong>{phase === "countdown" ? countdown : words.length ? cue : "Read naturally."}</strong><small>{phase === "recording" ? (progress.total && time >= progress.total ? "Reference guide complete. Finish your recording when ready." : "Follow the reference timing. Your microphone is recording.") : mode === "trial" ? "Aligned to your recorded voice" : "Play the reference to see each word light up"}</small>{phase !== "countdown" && <div className="audio-progress-panel">
              <div className="audio-progress-title"><span>{mode === "trial" ? "Your recording" : phase === "recording" ? "Reference guide" : "Reference audio"}</span><strong>{Math.round(progress.percent)}<small>%</small></strong></div>
              <div className="audio-progress-track" role="progressbar" aria-label="Overall audio progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.percent)} aria-valuetext={`${clockTime(progress.elapsed)} of ${progress.total ? clockTime(progress.total) : "unknown duration"}`}><i style={{width:`${progress.percent}%`}}/></div>
              <div className="audio-progress-times"><span>{clockTime(progress.elapsed)} elapsed</span><span>{progress.total ? `${clockTime(progress.total)} total` : "Loading duration…"}</span></div>
            </div>}</div>
            <div className="word-script" aria-label="Practice script">{words.length ? words.map((word,index) => {
              const duration = Math.max(0, word.t1 - word.t0);
              const timing = `${word.t0.toFixed(2).replace(/(\.\d)0$/, "$1")}–${word.t1.toFixed(2).replace(/(\.\d)0$/, "$1")}s`;
              return <span key={`${index}-${word.text}`} className="timed-word"
                ref={node => { wordElements.current[index] = node; }}
                style={{ width: `${Math.max(56, duration * 160)}px` }}>
                <button disabled={busy} className={`spoken-word ${active === index ? "current-word" : word.t1 <= time ? "past-word" : ""}`}
                  onClick={() => listenFrom(index)} aria-label={word.text} aria-current={active === index ? "true" : undefined}
                  aria-describedby={`word-timing-${index}`} title={`${timing} · Duration ${duration.toFixed(2)}s`}>
                  <span className="word-box-text">{word.text}</span>
                  <small id={`word-timing-${index}`} className="word-timing-label">{timing}</small>
                </button>
              </span>;
            }) : <p>{session.script}</p>}</div>
            {!session.words.length && <div className="alignment-action"><p>This earlier TTS recording needs word timing for the guided highlight.</p><button className="button secondary-button" onClick={getTiming} disabled={aligning || busy}>{aligning ? "Preparing word timing…" : "Prepare word highlights"}</button></div>}
            <p className="practice-footnote">Box width follows word duration; the small labels inside each box show start–end time. The recording guide follows the reference clock; it does not detect your words live. After scoring, replay your trial to follow your actual word timing.</p>
          </section>
          <section className="trial-recorder-card"><p className="eyebrow">02 / YOUR TURN</p><h2>One more try.</h2><p>Read the complete script in your natural voice. The reference stays silent while you record.</p><div className={`mic-orb ${phase === "recording" ? "pulsing" : ""}`} aria-hidden="true">{phase === "countdown" ? countdown : "♩"}</div><span className="trial-clock">{clockTime(seconds)} <small>/ {clockTime(session.max_trial_seconds)}</small></span>
            {phase === "recording" ? <button className="button stop-button" onClick={stop}><span className="stop-square"/>Stop & score</button> : <button className="button primary-button" onClick={start} disabled={busy || aligning}>{phase === "countdown" ? "Get ready…" : phase === "requesting" ? "Connecting microphone…" : phase === "uploading" ? "Saving your trial…" : phase === "scoring" ? "Scoring your trial…" : "Start voice trial"}</button>}
            <button className="text-button trial-upload" disabled={busy} onClick={() => fileInput.current?.click()}>Or upload a voice recording ↗</button><input type="file" ref={fileInput} className="visually-hidden" accept="audio/*,.webm,.m4a" onChange={upload} aria-label="Upload voice trial"/>
            {phase === "scoring" && <p className="trial-progress" role="status"><span className="spinner"/>{trial?.stage === "loading_model" ? "Preparing the scoring model…" : "Comparing your voice with the reference…"}</p>}
            <p className="practice-footnote">{session.model.status === "loading" ? "The scoring engine is warming up. Your first result may take longer." : "Five separate measures. No single overall score."}</p>
          </section>
        </div>
        {trial && <section className="trial-results"><div className="section-heading"><div><p className="eyebrow">LISTEN. COMPARE. TRY AGAIN.</p><h2>Trial {trial.trial_number || ""}</h2></div>{trial.audio_url && <audio key={trial.trial_id} ref={trialAudio} controls src={trial.audio_url} aria-label="Your trial recording" onEnded={event => { setMode("trial"); setTime(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : trial.duration_seconds || 0); }} onDurationChange={event => setTrialDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onPlay={() => { if (busy) { trialAudio.current.pause(); return; } refAudio.current?.pause(); setMode("trial"); setTime(trialAudio.current.currentTime); }} onSeeked={() => { setMode("trial"); setTime(trialAudio.current.currentTime); }}/>}</div>
          {trial.status === "complete" && !validScore && <div className="unreliable-result" role="status"><h3>Let’s try that once more.</h3><p>{score?.reason || "We couldn’t reliably match this recording to the script."}</p><p>Scores are hidden for this trial. Read every word with clear microphone audio.</p></div>}
          {validScore && <><div className="score-grid">{SCORE_AXES.map(([key,label,description]) => <div className="score-axis" key={key}><span>{label}</span><strong>{scoreLabel(key, score[key])}<small>{key !== "rate_ratio" && score[key] != null ? "/100" : ""}</small></strong><p>{description}</p>{key !== "rate_ratio" && Number.isFinite(score[key]) && <div className="score-track"><i style={{width:`${score[key]*100}%`}}/></div>}{key === "rate_ratio" && <p className="pace-note">1.00× matches the reference. Higher means slower.</p>}</div>)}</div><div className="word-feedback"><h3>Words worth another try</h3>{score.word_diff?.length ? score.word_diff.map((word,index) => <article key={index}><strong>{word.text}</strong><span>{word.note}</span><small>Reference {word.gt_dur.toFixed(2)}s · Your take {word.user_dur.toFixed(2)}s</small></article>) : <p>No large word-level deviations were flagged.</p>}</div><p className="results-note">These are experimental comparisons with your TTS reference, not a measure of overall speaking ability. Microphone conditions can affect the result.</p></>}
        </section>}
        {board && board.trials.length > 0 && <section className="trial-history"><div className="section-heading"><div><p className="eyebrow">LEADERBOARD</p><h2>Your best takes</h2></div><Link className="count-pill" href={`/leaderboard?run=${session.run_id}`}>All recordings →</Link></div><div className="history-list">{board.trials.map(item => <button key={item.trial_id} className={trial?.trial_id === item.trial_id ? "selected-trial" : ""} disabled={busy} onClick={() => { const found = session.trials.find(t => t.trial_id === item.trial_id); if (found) chooseTrial(found); }}><strong>{item.rank ? `#${item.rank}` : "–"} · Trial {item.trial_number}{item.best && <span className="count-pill" style={{marginLeft:8}}>BEST</span>}</strong><span>{item.overall != null ? `Avg ${Math.round(item.overall*100)} · Pronunciation ${Math.round((item.axes?.pronunciation ?? 0)*100)} · Rhythm ${Math.round((item.axes?.rhythm ?? 0)*100)} · Emphasis ${Math.round((item.axes?.stress ?? 0)*100)}` : "Unreliable · not ranked"}</span><small>{new Date(item.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</small></button>)}</div></section>}
        <section className="trial-history"><div className="section-heading"><div><p className="eyebrow">KEEP SHOWING UP</p><h2>Your practice history</h2></div><span className="count-pill">{session.trial_count} trials</span></div>{session.trials.length ? <div className="history-list">{session.trials.map(item => <button key={item.trial_id} className={trial?.trial_id === item.trial_id ? "selected-trial" : ""} disabled={busy} onClick={() => chooseTrial(item)}><strong>Trial {item.trial_number}{board?.best_trial_id === item.trial_id && <span className="count-pill" style={{marginLeft:8}}>BEST</span>}</strong><span>{item.status === "complete" ? item.score?.status === "ok" ? `Pronunciation ${scoreLabel("pronunciation_score",item.score.pronunciation_score)} · Rhythm ${scoreLabel("rhythm_score",item.score.rhythm_score)}` : "Try again · unreliable alignment" : item.status}</span><small>{new Date(item.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</small></button>)}</div> : <p className="muted">Your first trial is a starting point. Every new recording gets its own result.</p>}</section>
      </>}
    </main><footer><span className="footer-brand">Optune</span><span>Practice makes progress.</span></footer>
  </div>;
}
