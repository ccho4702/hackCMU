import { test, expect } from '@playwright/test';


test.beforeEach(async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('rehearse.user',JSON.stringify({
    user_id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:'Test User',email:'tester@example.test',
  })));
});

const runId='b'.repeat(32);
const words=[{text:'Hello',t0:0,t1:.4},{text:'world.',t0:.5,t1:1}];
const goodScore={status:'ok',pronunciation_score:.84,rate_ratio:1.12,rhythm_score:.78,intonation_score:.91,stress_match:.82,word_diff:[{text:'world.',note:'늘어짐',gt_dur:.5,user_dur:.7}],words:words.map(w=>({text:w.text,user:{t0:w.t0+.1,t1:w.t1+.1}}))};

async function mockMic(page) {
  await page.addInitScript(()=>{
    window.__stops=0;
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async options=>{
      window.__captureOptions=options;
      return {getTracks:()=>[{stop:()=>window.__stops++}]};
    }}});
    HTMLMediaElement.prototype.play=async function(){this.dispatchEvent(new Event('play'));};
    window.MediaRecorder=class {
      static isTypeSupported(type){return type==='audio/mp4';}
      constructor(stream,options){this.mimeType=options.mimeType;this.state='inactive';}
      start(){this.state='recording';}
      stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['voice'],{type:this.mimeType})});this.onstop?.();});}
    };
  });
}

async function stub(page, unreliable=false, timing=words, scoring=goodScore) {
  let count=0;const trials=[];
  const session=()=>({run_id:runId,script:'Hello world.',scoring_text:'Hello world.',reference_audio_url:`/api/runs/${runId}/outputs/reference_speech.mp3`,duration_seconds:1.2,max_trial_seconds:30,words:timing,model:{status:'ready'},trials:[...trials].reverse(),trial_count:count});
  await page.route(`**/api/runs/${runId}/practice`,route=>route.fulfill({json:session()}));
  await page.route(`**/api/runs/${runId}/trials`,route=>{
    count++;const id=String(count).padStart(32,'a');
    trials.push({trial_id:id,trial_number:count,created_at:new Date().toISOString(),status:'complete',stage:'complete',audio_url:`/api/runs/${runId}/trials/${id}/audio`,score:unreliable?{...scoring,status:'unreliable',reason:'Please read the complete script.'}:scoring});
    return route.fulfill({status:202,json:{trial_id:id,trial_number:count,status:'queued',stage:'queued'}});
  });
  await page.route(new RegExp(`/api/runs/${runId}/trials/[a-f0-9]{32}$`),route=>route.fulfill({json:trials.at(-1)}));
  return ()=>count;
}

test('reference playback highlights the current word',async({page})=>{
  await mockMic(page);await stub(page);await page.goto(`/practice?run=${runId}`);
  await expect(page.getByRole('button',{name:'Hello',exact:true})).toBeVisible();
  await page.getByLabel('TTS reference').evaluate(audio=>{Object.defineProperty(audio,'currentTime',{configurable:true,writable:true,value:.55});audio.dispatchEvent(new Event('seeked'));});
  await expect(page.locator('.current-word .word-box-text')).toHaveText('world.');
  await expect(page.locator('.word-cue > strong')).toHaveText('world.');
  await expect(page.locator('.duration-title strong')).toContainText('0.50');
  await expect(page.locator('.word-timestamps')).toContainText('Start 0.50s');
  await expect(page.locator('.word-timestamps')).toContainText('End 1.00s');
  await expect(page.getByRole('progressbar', { name: 'Current word duration progress' })).toHaveAttribute('aria-valuenow', '10');
});

test('microphone trial scores, keeps history, and can be repeated',async({page})=>{
  await mockMic(page);const calls=await stub(page);await page.goto(`/practice?run=${runId}`);
  for(let i=1;i<=2;i++) {
    await page.getByRole('button',{name:'Start voice trial',exact:true}).click();
    await page.getByRole('button',{name:'Stop & score'}).click();
    await expect(page.locator('.score-axis')).toHaveCount(5);
    await expect(page.locator('.history-list button')).toHaveCount(i);
  }
  expect(calls()).toBe(2);
  expect(await page.evaluate(()=>window.__captureOptions.video)).toBe(false);
  expect(await page.evaluate(()=>window.__stops)).toBe(2);
  await expect(page.getByText('1.12×',{exact:true})).toBeVisible();
});

test('unreliable trials hide all numeric scores',async({page})=>{
  await mockMic(page);await stub(page,true);await page.goto(`/practice?run=${runId}`);
  await page.locator('input[type=file]').setInputFiles({name:'voice.webm',mimeType:'audio/webm',buffer:Buffer.from('voice')});
  await expect(page.getByText('Scores are hidden for this trial.',{exact:false})).toBeVisible();
  await expect(page.locator('.score-grid')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Start voice trial',exact:true})).toBeEnabled();
});

test('practice layout works on mobile',async({page})=>{
  await stub(page);await page.setViewportSize({width:390,height:844});await page.goto(`/practice?run=${runId}`);
  await expect(page.getByRole('button',{name:'Start voice trial',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'test-results/practice-mobile.png',fullPage:true});
});

test('real reference timing and saved scoring results render',async({page})=>{
  test.skip(!process.env.PRACTICE_RUN_ID,'Set PRACTICE_RUN_ID to check an existing calibration run without new scoring requests.');
  await page.goto(`/practice?run=${process.env.PRACTICE_RUN_ID}`);
  await expect(page.getByRole('button',{name:'Start voice trial',exact:true})).toBeVisible();
  await expect(page.locator('.spoken-word').first()).toBeVisible();
  const reliable=page.locator('.history-list button').filter({hasText:'Pronunciation'}).first();
  if(await reliable.count()) {await reliable.click();await expect(page.locator('.score-axis')).toHaveCount(5);}
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'test-results/practice-real.png',fullPage:true});
});


test('word boxes scale with spoken duration and show timing inside the lower edge',async({page})=>{
  const timing=[{text:'One',t0:0,t1:.2},{text:'two',t0:.2,t1:.6},{text:'three',t0:.6,t1:1.4}];
  await mockMic(page);await stub(page,false,timing);
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`/practice?run=${runId}`);
  const boxes=page.locator('.timed-word');
  await expect(boxes).toHaveCount(3);
  const widths=await boxes.evaluateAll(items=>items.map(item=>item.getBoundingClientRect().width));
  expect(widths[0]).toBeCloseTo(56,0);
  expect(widths[1]).toBeCloseTo(64,0);
  expect(widths[2]/widths[1]).toBeCloseTo(2,1);
  await expect(boxes.nth(1).locator('.word-timing-label')).toHaveText('0.2–0.6s');
  const box=await boxes.nth(1).locator('button').boundingBox();
  const label=await boxes.nth(1).locator('small').boundingBox();
  expect(label.y).toBeGreaterThan(box.y+box.height/2);
  expect(label.y+label.height).toBeLessThanOrEqual(box.y+box.height);
  expect(await boxes.nth(1).locator("button").evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(13);
  await page.getByLabel('TTS reference').evaluate(audio=>Object.defineProperty(audio,'currentTime',{configurable:true,writable:true,value:0}));
  await page.getByRole('button',{name:'two',exact:true}).click();
  expect(await page.getByLabel('TTS reference').evaluate(audio=>audio.currentTime)).toBe(.2);
  await expect(page.locator('.current-word .word-box-text')).toHaveText('two');
  await page.screenshot({path:'test-results/practice-duration-boxes.png',fullPage:true});
});

test('long and short word boxes stay inside the mobile viewport',async({page})=>{
  const timing=[{text:'I',t0:0,t1:.02},{text:'practice',t0:.1,t1:.5},{text:'presentations',t0:.6,t1:2.6}];
  await stub(page,false,timing);await page.setViewportSize({width:390,height:844});
  await page.goto(`/practice?run=${runId}`);
  await expect(page.locator('.timed-word')).toHaveCount(3);
  expect(await page.locator('.spoken-word').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(13);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const bounds=await page.locator('.word-script').boundingBox();
  for(const box of await page.locator('.timed-word').all()) {
    const b=await box.boundingBox();
    expect(b.x+b.width).toBeLessThanOrEqual(bounds.x+bounds.width);
  }
  await page.screenshot({path:'test-results/practice-duration-mobile.png',fullPage:true});
});


test('trial playback uses the recorded durations instead of reference durations',async({page})=>{
  const scoring={...goodScore,words:[{text:'Hello',user:{t0:.1,t1:.9}},{text:'world.',user:{t0:1,t1:1.7}}]};
  await mockMic(page);await stub(page,false,words,scoring);await page.goto(`/practice?run=${runId}`);
  const referenceWidth=(await page.locator('.timed-word').first().boundingBox()).width;
  await page.locator('input[type=file]').setInputFiles({name:'voice.webm',mimeType:'audio/webm',buffer:Buffer.from('voice')});
  const trial=page.getByLabel('Your trial recording');
  await expect(trial).toBeVisible();
  await trial.evaluate(audio=>{
    Object.defineProperty(audio,'currentTime',{configurable:true,writable:true,value:.15});
    audio.dispatchEvent(new Event('play'));
  });
  await expect(page.locator('.word-timing-label').first()).toHaveText('0.1–0.9s');
  const trialWidth=(await page.locator('.timed-word').first().boundingBox()).width;
  expect(trialWidth/referenceWidth).toBeCloseTo(2,1);
});
