import { test, expect } from "@playwright/test";

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => localStorage.setItem("rehearse.user", JSON.stringify({
    user_id:"aaaaaaaaaaaaaaaaaaaaaaaa",name:"Test User",email:"tester@example.test",
  })));
});

const runId = "a".repeat(32);
const manifest = {
  run_id: runId, status: "success", stage: "complete",
  original_video_url: `/api/runs/${runId}/original`,
  outputs: { tts_audio: `/api/runs/${runId}/outputs/reference_speech.mp3`, improved_script: `/api/runs/${runId}/outputs/improved_script.txt` },
  results: {
    transcript: { text: "Um, I has an idea." },
    nonverbal_feedback: [{ start_time: "00:01.000", end_time: "00:03.000", content: "시선이 아래를 향합니다. 렌즈 부근으로 시선을 돌리세요." }],
    script_feedback: { original_script: "Um, I has an idea.", improved_script: "I have an idea to share.", issues: [{ original: "I has", problem: "문법 오류", suggestion: "I have" }] },
  },
};

async function fakeCamera(page, denied = false) {
  await page.addInitScript(({ denied }) => {
    window.__stoppedTracks = 0;
    window.__captureCalls = 0;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => {
      if (denied) throw new DOMException("Denied", "NotAllowedError");
      window.__captureCalls++;
      const tracks = ["video", "audio"].map(kind => ({ kind, stop: () => window.__stoppedTracks++ }));
      return { getTracks: () => tracks, getAudioTracks: () => [tracks[1]], getVideoTracks: () => [tracks[0]] };
    } } });
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", { configurable: true, get() { return this.__stream; }, set(value) { this.__stream = value; } });
    HTMLMediaElement.prototype.play = async () => {};
    window.MediaRecorder = class {
      static isTypeSupported(type) { return type === "video/mp4"; }
      constructor(stream, options) { this.stream = stream; this.mimeType = options.mimeType; this.state = "inactive"; }
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(["recorded camera + audio"], { type: this.mimeType }) }); this.onstop?.(); }); }
    };
  }, { denied });
}

async function stubPipeline(page, failure = false) {
  let uploads = 0;
  await page.route("**/api/pipeline", async route => {
    uploads++;
    const body = route.request().postDataBuffer().toString();
    expect(body).toContain('name="file"');
    expect(body).toContain('name="user_id"');
    await route.fulfill({ status: 202, json: { run_id: runId, status: "queued", stage: "queued", outputs: {} } });
  });
  await page.route(`**/api/runs/${runId}`, route => route.fulfill({ json: failure ? { ...manifest, status: "failed", stage: "speech_generation", error_message: "Voice access is unavailable.", outputs: { improved_script: manifest.outputs.improved_script } } : manifest }));
  return () => uploads;
}

test("record, stop, upload once, render results, and release camera/microphone", async ({ page }) => {
  await fakeCamera(page);
  const uploads = await stubPipeline(page);
  await page.goto("/streaming");
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop & analyze" })).toBeVisible();
  await page.getByRole("button", { name: "Stop & analyze" }).click();
  await expect(page.getByRole("link", { name: /Practice this script/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Improved script", exact: true })).toContainText("I have an idea to share.");
  await expect(page.getByRole("region", { name: "Original script", exact: true })).toContainText("Um, I has an idea.");
  await expect(page.getByLabel("Improved speech")).toHaveAttribute("src", manifest.outputs.tts_audio);
  expect(uploads()).toBe(1);
  expect(await page.evaluate(() => window.__stoppedTracks)).toBe(2);
});

test("denied camera access offers upload without submitting a job", async ({ page }) => {
  await fakeCamera(page, true);
  const uploads = await stubPipeline(page);
  await page.goto("/streaming");
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.getByRole("alert", { name: "Recording error" })).toContainText("Camera or microphone access was denied");
  expect(uploads()).toBe(0);
});

test("uploaded recording preserves partial results on TTS failure", async ({ page }) => {
  const uploads = await stubPipeline(page, true);
  await page.goto("/streaming");
  await page.locator('input[type="file"]').setInputFiles({ name: "take.mov", mimeType: "video/quicktime", buffer: Buffer.from("test video") });
  await expect(page.locator(".error-banner")).toContainText("Voice access is unavailable");
  await expect(page.getByRole("region", { name: "Improved script", exact: true })).toContainText("I have an idea to share.");
  await expect(page.getByRole("link", { name: "Try a new recording" })).toBeVisible();
  expect(uploads()).toBe(1);
});

test("a saved job restores after reload without a second upload", async ({ page }) => {
  const uploads = await stubPipeline(page);
  await page.goto(`/evaluation?run=${runId}`);
  await expect(page.getByRole("link", { name: /Practice this script/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Improved script", exact: true })).toContainText("I have an idea to share.");
  expect(uploads()).toBe(0);
});

test("mobile layout fits the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/streaming");
  await expect(page.getByRole("button", { name: "Start recording", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("real saved run loads its transcript, revision, and playable audio", async ({ page }) => {
  test.skip(!process.env.REAL_RUN_ID, "Set REAL_RUN_ID to inspect an existing completed run; no generation requests are made.");
  let generationCalls = 0;
  page.on("request", request => { if (request.url().endsWith("/api/pipeline")) generationCalls++; });
  await page.goto(`/evaluation?run=${process.env.REAL_RUN_ID}`);
  await expect(page.getByRole("link", { name: /Practice this script/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Improved script", exact: true })).not.toBeEmpty();
  await expect(page.getByLabel("Original recording")).toBeVisible();
  const audio = page.getByLabel("Improved speech");
  await expect(audio).toHaveAttribute("src", /reference_speech.mp3/);
  await audio.evaluate(element => element.load());
  await expect.poll(() => audio.evaluate(element => Number.isFinite(element.duration) && element.duration > 0)).toBe(true);
  expect(generationCalls).toBe(0);
  await expect.poll(() => page.getByLabel("Original recording").evaluate(element => element.readyState >= 2)).toBe(true);
  await page.screenshot({ path: "test-results/real-run-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/real-run-mobile.png", fullPage: true });
});

test("main frontend navigation and streaming layout remain available", async ({ page }) => {
  await page.route("**/api/capabilities", route => route.fulfill({ json: { landmarks: false } }));
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Start recording/i })).toBeVisible();
  await page.goto("/streaming");
  await expect(page).toHaveURL(/\/streaming$/);
  await expect(page.getByRole("heading", { name: "Live Session", exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Show mask" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Start recording", exact: true })).toBeEnabled();
  await page.screenshot({ path: "test-results/main-streaming-desktop.png", fullPage: true });
});

async function stubMainAnalysis(page) {
  const analysisId = "anl_browser_test";
  await page.route("**/api/v1/analyses", route => route.fulfill({status:202,json:{analysisId,status:"queued"}}));
  await page.route(`**/api/v1/analyses/${analysisId}/status`, route => route.fulfill({json:{analysisId,status:"processing",progress:.3,phase:"Analyzing frames",mock:false}}));
  await page.route(`**/api/v1/analyses/${analysisId}/events`, route => route.fulfill({status:200,contentType:"text/event-stream",body:'event: status\ndata: '+JSON.stringify({analysisId,status:"processing",progress:.3,phase:"Analyzing frames"})+'\n\n'}));
  await page.route("**/api/v1/live/sessions", route => route.fulfill({status:201,json:{sessionId:analysisId,analysisId,mock:false}}));
  await page.route(`**/api/v1/live/sessions/${analysisId}/stop`, route => route.fulfill({json:{analysisId,status:"completed"}}));
  return analysisId;
}

test("main recorded-video flow keeps facial analysis and connects script evaluation", async ({page}) => {
  const analysisId=await stubMainAnalysis(page);
  const uploads=await stubPipeline(page);
  await page.goto("/");
  await page.getByRole("button",{name:/Upload a video/i}).click();
  await page.locator('input[type="file"]').setInputFiles({name:"take.mp4",mimeType:"video/mp4",buffer:Buffer.from("test video")});
  await page.getByRole("button",{name:"Analyze",exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/analysis/${analysisId}$`));
  expect(uploads()).toBe(1);
  await page.getByRole("link",{name:"Evaluation",exact:true}).click();
  await expect(page.getByRole("region", { name: "Improved script", exact: true })).toContainText("I have an idea to share.");
});

test("main live recording submits voice pipeline once and keeps the main review route", async ({page}) => {
  await fakeCamera(page);
  const analysisId=await stubMainAnalysis(page);
  const uploads=await stubPipeline(page);
  await page.goto("/live");
  await page.getByRole("button",{name:"Start live analysis",exact:true}).click();
  await page.getByRole("button",{name:"Stop session",exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/analysis/${analysisId}$`));
  expect(uploads()).toBe(1);
  expect(await page.evaluate(()=>window.__stoppedTracks)).toBe(await page.evaluate(()=>window.__captureCalls * 2));
});

test("legacy saved-run links redirect to the new evaluation page", async ({page}) => {
  await stubPipeline(page);
  await page.goto(`/?run=${runId}`);
  await expect(page).toHaveURL(new RegExp(`/evaluation\\?run=${runId}$`));
  await expect(page.getByRole("region", { name: "Improved script", exact: true })).toContainText("I have an idea to share.");
});
