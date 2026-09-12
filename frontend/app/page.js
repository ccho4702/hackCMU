"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet, startPipeline } from "@/lib/api";
import { MAX_RECORDING_SECONDS, MAX_UPLOAD_BYTES, clockTime, recordingError, recordingFilename, recordingOptions, timestampSeconds } from "@/lib/recording";

const STAGES = [
  ["prepare", "Preparing your recording", "Getting your video and audio ready."],
  ["nonverbal_analysis", "Looking at your delivery", "Finding useful moments in your gaze, gestures, and posture."],
  ["transcription", "Capturing your words", "Turning your original audio into a transcript."],
  ["script_analysis", "Refining your script", "Making your ideas clearer while keeping your meaning."],
  ["speech_generation", "Creating your next take", "Reading your revised script in your reference voice."],
];

function Icon({ name, size = 20, ...props }) {
  const paths = {
    camera: <><path d="M15 8h2l4-3v14l-4-3h-2"/><rect x="3" y="5" width="12" height="14" rx="3"/></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    play: <path d="m8 4 12 8-12 8Z"/>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.arrow}</svg>;
}

export default function Home() {
  const [phase, setPhase] = useState("idle");
  const [seconds, setSeconds] = useState(0);
  const [localUrl, setLocalUrl] = useState("");
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [scriptTab, setScriptTab] = useState("improved");
  const liveRef = useRef(null);
  const playerRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const urlRef = useRef("");
  const mountedRef = useRef(true);
  const operationRef = useRef(false);
  const pollAbortRef = useRef(null);

  const busy = ["requesting", "recording", "stopping", "uploading", "processing"].includes(phase);
  const feedback = job?.results?.nonverbal_feedback;
  const script = job?.results?.script_feedback;
  const transcript = job?.results?.transcript?.text || script?.original_script;
  const audioUrl = job?.outputs?.tts_audio;
  const videoUrl = localUrl || job?.original_video_url;
  const stageIndex = STAGES.findIndex(([id]) => id === job?.stage);
  const hasResults = Boolean(feedback || script || transcript || audioUrl);

  useEffect(() => {
    mountedRef.current = true;
    const runId = new URLSearchParams(window.location.search).get("run") || localStorage.getItem("rehearse.lastRun");
    const controller = new AbortController();
    if (runId && /^[a-f0-9]{32}$/.test(runId)) {
      apiGet(`/runs/${runId}`, { signal: controller.signal }).then((data) => {
        if (!mountedRef.current || operationRef.current) return;
        setJob(data);
        setPhase(data.status === "success" ? "complete" : data.status === "failed" ? "failed" : "processing");
      }).catch(() => {});
    }
    return () => {
      mountedRef.current = false;
      controller.abort();
      pollAbortRef.current?.abort();
      clearInterval(timerRef.current);
      if (recorderRef.current) {
        recorderRef.current.onstop = null;
        if (recorderRef.current.state !== "inactive") recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== "processing" || !job?.run_id) return;
    let timer;
    let stopped = false;
    const controller = new AbortController();
    pollAbortRef.current = controller;
    const poll = async () => {
      try {
        const data = await apiGet(`/runs/${job.run_id}`, { signal: controller.signal });
        if (stopped) return;
        setJob(data);
        setPollError("");
        if (["success", "failed"].includes(data.status)) {
          setPhase(data.status === "success" ? "complete" : "failed");
          operationRef.current = false;
          return;
        }
      } catch (e) {
        if (stopped) return;
        setPollError(`Connection interrupted. Your recording is saved; reconnecting… (${e.message})`);
      }
      if (!stopped) timer = setTimeout(poll, 2500);
    };
    poll();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [phase, job?.run_id]);

  function clearRecording() {
    setError(""); setPollError(""); setJob(null); setSeconds(0);
    localStorage.removeItem("rehearse.lastRun");
    window.history.replaceState(null, "", window.location.pathname);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = "";
    setLocalUrl("");
    fileRef.current = null;
  }

  function stopTracks() {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function submit(file) {
    operationRef.current = true;
    setPhase("uploading"); setError("");
    try {
      if (!file.size) throw new Error("The recording is empty. Please record again.");
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("Please upload a video smaller than 100 MB.");
      let userId = localStorage.getItem("rehearse.userId");
      if (!userId) { userId = crypto.randomUUID(); localStorage.setItem("rehearse.userId", userId); }
      const data = await startPipeline(file, userId);
      localStorage.setItem("rehearse.lastRun", data.run_id);
      window.history.replaceState(null, "", `?run=${data.run_id}`);
      if (mountedRef.current) { setJob(data); setPhase("processing"); }
    } catch (e) {
      if (mountedRef.current) { setError(e.message); setPhase("failed"); }
      operationRef.current = false;
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      setPhase("stopping");
      recorderRef.current.stop();
      clearInterval(timerRef.current);
    }
  }

  async function startRecording() {
    if (operationRef.current) return;
    operationRef.current = true;
    clearRecording(); setPhase("requesting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("Recording needs a supported browser on localhost or HTTPS. You can upload an existing video instead.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: true });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      if (!stream.getAudioTracks().length || !stream.getVideoTracks().length) throw new Error("Both a camera and microphone are needed to record.");
      const recorder = new MediaRecorder(stream, recordingOptions(MediaRecorder));
      recorderRef.current = recorder;
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        recorder.onstop = null; stopTracks(); operationRef.current = false;
        if (mountedRef.current) { setError("The recording was interrupted. Please try again."); setPhase("failed"); }
      };
      recorder.onstop = () => {
        stopTracks();
        if (!mountedRef.current) return;
        const mimeType = recorder.mimeType || chunks[0]?.type || "video/webm";
        const blob = new Blob(chunks, { type: mimeType });
        const file = new File([blob], recordingFilename(mimeType), { type: mimeType });
        fileRef.current = file;
        urlRef.current = URL.createObjectURL(blob);
        setLocalUrl(urlRef.current);
        submit(file);
      };
      recorder.start(1000);
      setPhase("recording");
      const began = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MAX_RECORDING_SECONDS && recorder.state === "recording") { setPhase("stopping"); recorder.stop(); clearInterval(timerRef.current); }
      }, 250);
    } catch (e) {
      stopTracks(); operationRef.current = false;
      if (mountedRef.current) { setError(recordingError(e)); setPhase("failed"); }
    }
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || operationRef.current || busy) return;
    clearRecording();
    if (file.size > MAX_UPLOAD_BYTES) { setError("Please upload a video smaller than 100 MB."); setPhase("failed"); return; }
    fileRef.current = file;
    urlRef.current = URL.createObjectURL(file);
    setLocalUrl(urlRef.current);
    await submit(file);
  }

  function seek(timestamp) {
    if (!playerRef.current) return;
    playerRef.current.currentTime = timestampSeconds(timestamp);
    playerRef.current.play().catch(() => {});
    playerRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Rehearse home"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span>rehearse<span className="brand-dot">.</span></Link>
        <div className="topbar-right"><span className="studio-badge"><span/>Practice studio</span><span className="event-badge">BUILT AT HACKCMU ’26</span></div>
      </header>
      <main className="workspace">
        <section className="intro">
          <div><p className="eyebrow">MAKE YOURSELF HEARD</p><h1>Your next take,<br/><span>better.</span></h1><p className="intro-copy">A little practice. A clearer story. Record your presentation<br className="desktop-break"/> and turn the next version into your best one yet.</p></div>
          <div className="intro-note"><span className="note-line"/><p>One recording.<br/>A clearer script.<br/><strong>Still your voice.</strong></p></div>
        </section>

        <div className="studio-grid">
          <section className="recorder-card" aria-labelledby="record-title">
            <div className="card-heading"><div><span className="step-number">01</span><h2 id="record-title">Your rehearsal</h2></div><span className={`record-state ${phase === "recording" ? "is-recording" : ""}`}><span/>{phase === "recording" ? "RECORDING" : videoUrl ? "ORIGINAL TAKE" : "READY WHEN YOU ARE"}</span></div>
            <div className="viewfinder">
              {["requesting", "recording", "stopping"].includes(phase) ? (
                <video className="live-video" ref={(node) => { liveRef.current = node; if (node && streamRef.current && node.srcObject !== streamRef.current) { node.srcObject = streamRef.current; node.play().catch(() => {}); } }} autoPlay muted playsInline aria-label="Live camera preview"/>
              ) : videoUrl ? (
                <video key={videoUrl} ref={playerRef} src={videoUrl} controls playsInline preload="metadata" aria-label="Original recording"/>
              ) : (
                <div className="camera-placeholder"><div className="camera-symbol"><Icon name="camera" size={32}/></div><h3>Your stage is ready.</h3><p>Find your light. Take a breath.<br/>Start whenever you’re ready.</p><span className="corner tl"/><span className="corner tr"/><span className="corner bl"/><span className="corner br"/></div>
              )}
              {phase === "requesting" && <div className="viewfinder-message">Allow your camera and microphone to get started.</div>}
              {phase === "recording" && <div className="record-timer"><span/>{clockTime(seconds)} <em>/ 01:30</em></div>}
            </div>
            <div className="record-controls">
              <div className="device-note"><Icon name="mic" size={15}/><span>Camera + microphone</span></div>
              {phase === "recording" ? <button className="button stop-button" onClick={stopRecording}><span className="stop-square"/>Stop & analyze</button> : <button className="button primary-button" onClick={startRecording} disabled={busy}><span className="record-dot"/>{phase === "requesting" ? "Connecting…" : phase === "stopping" ? "Saving…" : ["uploading", "processing"].includes(phase) ? "Working on your take…" : videoUrl ? "Record a new take" : "Start recording"}</button>}
            </div>
            <div className="upload-row"><span>Up to 90 seconds · your own voice</span><button className="text-button" disabled={busy} onClick={() => inputRef.current?.click()}><Icon name="upload" size={15}/>Upload a recording</button><input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime,.mov,.mkv" onChange={uploadFile} className="visually-hidden" aria-label="Upload a recording"/></div>
          </section>

          <aside className="guide-card">
            <p className="eyebrow">A SMALL TAKE. A BIG DIFFERENCE.</p><h2>Meet your<br/>next version.</h2>
            <div className="guide-item"><span>01</span><div><h3>See your delivery</h3><p>Spot the moments where your gaze, gestures, or posture get in the way.</p></div></div>
            <div className="guide-item"><span>02</span><div><h3>Find the right words</h3><p>Compare what you said with a clearer, more natural presentation script.</p></div></div>
            <div className="guide-item"><span>03</span><div><h3>Hear the difference</h3><p>Listen to the improved script in your reference voice, then make it your own.</p></div></div>
            <div className="recording-tip"><span>↗</span><p>For a useful first take, keep your face and hands in frame and speak naturally.</p></div>
          </aside>
        </div>

        {(error || job?.status === "failed") && <div className="error-banner" role="alert"><div><strong>We couldn’t finish this take.</strong><p>{error || job.error_message || "Processing stopped. Your available results are shown below."}</p></div>{localUrl && !busy && <button className="button secondary-button" onClick={() => { setJob(null); submit(fileRef.current); }}>Analyze again</button>}</div>}

        {["uploading", "processing"].includes(phase) && <section className="progress-card" aria-live="polite"><div className="progress-heading"><span className="spinner"/><div><h2>{phase === "uploading" ? "Saving your take…" : STAGES[stageIndex]?.[1] || "Your take is in the queue…"}</h2><p>{phase === "uploading" ? "Your original recording will appear here." : STAGES[stageIndex]?.[2] || "We’ll start in a moment. You can leave this page open."}</p></div></div><ol className="stage-list">{STAGES.map(([id, title], index) => <li key={id} className={index < stageIndex ? "done" : index === stageIndex ? "active" : ""}><span>{index < stageIndex ? <Icon name="check" size={12}/> : index + 1}</span>{title}</li>)}</ol>{pollError && <p className="connection-note">{pollError}</p>}</section>}

        {hasResults && <section className="results-section" aria-labelledby="results-title">
          <div className="section-heading"><div><p className="eyebrow">YOUR NEXT TAKE STARTS HERE</p><h2 id="results-title">A little clarity goes a long way.</h2></div>{phase === "complete" && <span className="complete-badge"><Icon name="check" size={15}/>Rehearsal complete</span>}</div>
          <div className="results-grid">
            <section className="feedback-card"><div className="card-heading"><div><span className="step-number">02</span><h2>Delivery notes</h2></div>{feedback && <span className="count-pill">{feedback.length}</span>}</div><p className="card-description">Click a moment to revisit it in your original take.</p><div className="feedback-list">{feedback ? feedback.length ? feedback.map((item, i) => <article className="feedback-item" key={`${item.start_time}-${i}`}><button className="time-link" onClick={() => seek(item.start_time)}><Icon name="play" size={11}/>{item.start_time.slice(0, 5)} — {item.end_time.slice(0, 5)}</button><p>{item.content}</p></article>) : <div className="empty-result"><Icon name="check"/><p>No clear nonverbal issues were flagged in this take.</p></div> : <p className="muted">Your delivery notes will appear here.</p>}</div></section>
            <section className="script-card"><div className="card-heading"><div><span className="step-number">03</span><h2>Your words, refined</h2></div>{job?.outputs?.improved_script && <a className="icon-link" href={job.outputs.improved_script} download aria-label="Download improved script"><Icon name="download" size={18}/></a>}</div><div className="script-tabs" role="tablist" aria-label="Script version"><button role="tab" aria-selected={scriptTab === "original"} onClick={() => setScriptTab("original")}>Original transcript</button><button role="tab" aria-selected={scriptTab === "improved"} onClick={() => setScriptTab("improved")}>Improved script <span>↗</span></button></div><div className="script-body" role="tabpanel" aria-label={scriptTab === "original" ? "Original transcript" : "Improved script"}>{scriptTab === "original" ? transcript || "Your transcript is being prepared…" : script?.improved_script || "Your revised script is being prepared…"}</div>{script?.issues?.length > 0 && <details className="script-changes"><summary>{script.issues.length} script improvements</summary>{script.issues.map((item, i) => <div className="script-issue" key={i}><q>{item.original}</q><p>{item.problem}</p><p className="suggestion">↳ {item.suggestion}</p></div>)}</details>}</section>
          </div>
          <section className="audio-card"><div className="audio-description"><div className="sound-mark" aria-hidden="true">{[12,24,36,20,42,28,16].map((height,i) => <i key={i} style={{height}}/>)}</div><div><p className="eyebrow">SOUNDS LIKE YOUR NEXT TAKE</p><h2>The improved script. Your voice.</h2><p>Listen, find your rhythm, and give it another go.</p></div></div>{audioUrl ? <div className="audio-player"><audio controls src={audioUrl} preload="metadata" aria-label="Improved speech"/><a href={audioUrl} download className="text-button"><Icon name="download" size={15}/>Download audio</a></div> : <span className="audio-pending">{job?.status === "failed" ? "Audio isn’t available for this take." : "Your audio will appear here when it’s ready."}</span>}</section>
          <p className="results-note">A practice reference, not a score. Review the transcript, especially names, and take the suggestions that help you.</p>
        </section>}
      </main>
      <footer><span className="footer-brand">rehearse.</span><span>Small steps. Stronger presentations.</span><span>MADE FOR YOUR NEXT TAKE ↗</span></footer>
    </div>
  );
}
