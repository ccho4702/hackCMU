import { test, expect } from "@playwright/test";
const runId="b".repeat(32);
const original="Hi everyone. Um, today I want to talk about our project. So, public speaking is something a lot of people find hard. We made a tool that looks at your recording and helps you find things to improve. It looks at how you present and what you say. Then you can practice again, and hopefully get better. I think this could be useful for students and anyone preparing a presentation.";
const improved="Hello everyone. Today, I’ll introduce our presentation practice tool.\n\nPublic speaking can be challenging. Our tool helps you turn each recording into a focused practice session by reviewing both your delivery and your script.\n\nYou receive specific feedback, a clearer version of your presentation, and a voice reference to practice with. Record another take to see how your delivery changes.\n\nOur goal is to help students and presenters practice with a clear sense of what to improve next.";

async function showReview(page, pending=false) {
  await page.route(`**/api/runs/${runId}`,route=>route.fulfill({json:{
    run_id:runId,status:pending?"failed":"success",stage:pending?"script_analysis":"complete",outputs:pending?{}:{tts_audio:"/reference.wav"},
    original_video_url:"/test-video.mp4",
    results:{transcript:{text:original},nonverbal_feedback:[],vocal_feedback:[],...(!pending?{script_feedback:{original_script:original,improved_script:improved,issues:[]}}:{})},
  }}));
  // A valid short WAV lets the native player load without a provider call.
  const wav=Buffer.alloc(44+16000*8*2);
  wav.write("RIFF");wav.writeUInt32LE(wav.length-8,4);wav.write("WAVEfmt ",8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
  wav.write("data",36);wav.writeUInt32LE(wav.length-44,40);
  await page.route("**/reference.wav", route => {
    const range=route.request().headers()["range"]?.match(/bytes=(\d+)-(\d*)/);
    const start=range?Number(range[1]):0;
    const end=range?.[2]?Math.min(Number(range[2]),wav.length-1):wav.length-1;
    return route.fulfill({status:range?206:200,contentType:"audio/wav",body:wav.subarray(start,end+1),
      headers:{"Accept-Ranges":"bytes","Content-Length":String(end-start+1),...(range?{"Content-Range":`bytes ${start}-${end}/${wav.length}`}:{})}});
  });
  await page.goto(`/evaluation?run=${runId}`);
}

test("desktop keeps script comparison below the reference voice player",async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await showReview(page);
  const revised=page.getByRole("region",{name:"Improved script",exact:true});
  const recorded=page.getByRole("region",{name:"Original script",exact:true});
  await expect(revised).toContainText(improved);
  await expect(recorded).toContainText(original);
  await expect(page.getByRole("tablist",{name:"Script version"})).toHaveCount(0);
  const r=await revised.boundingBox(),o=await recorded.boundingBox();
  expect(r.x).toBeGreaterThan(o.x);
  expect(Math.abs(r.y-o.y)).toBeLessThan(2);
  expect(Math.abs(r.width-o.width)).toBeLessThan(2);
  const recording=await page.getByRole("heading",{name:"Original recording",exact:true}).boundingBox();
  const voice=page.getByRole("region",{name:"Reference voice",exact:true});
  const v=await voice.boundingBox();
  expect(v.y).toBeGreaterThan(recording.y);
  expect(r.y).toBeGreaterThan(v.y+v.height);
  await expect(voice.getByRole("button",{name:"Play reference voice"})).toBeVisible();
  await expect.poll(()=>voice.getByLabel("Improved speech").evaluate(audio=>audio.readyState)).toBeGreaterThan(0);
  await page.screenshot({path:"test-results/script-comparison-desktop.png",fullPage:true});
});

test("mobile places the improved script first without horizontal overflow",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await showReview(page);
  const revised=page.getByRole("region",{name:"Improved script",exact:true});
  const recorded=page.getByRole("region",{name:"Original script",exact:true});
  await expect(revised).toContainText(improved);
  await expect(recorded).toContainText(original);
  const r=await revised.boundingBox(),o=await recorded.boundingBox();
  expect(o.y).toBeGreaterThan(r.y+r.height);
  const voice=page.getByRole("region",{name:"Reference voice",exact:true});
  const v=await voice.boundingBox();
  expect(r.y).toBeGreaterThan(v.y+v.height);
  await expect(voice.getByRole("button",{name:"Play reference voice"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:"test-results/script-comparison-mobile.png",fullPage:true});
});

test("the original script remains readable if revision fails",async({page})=>{
  await showReview(page,true);
  await expect(page.getByRole("region",{name:"Reference voice",exact:true})).toContainText("Reference audio is not available");
  await expect(page.getByRole("region",{name:"Original script",exact:true})).toContainText(original);
  await expect(page.getByRole("region",{name:"Improved script",exact:true})).toContainText("Your improved script will appear here.");
});


test("reference player supports play, pause and keyboard seeking", async ({page}) => {
  await showReview(page);
  const voice=page.getByRole("region",{name:"Reference voice",exact:true});
  const audio=voice.getByLabel("Improved speech");
  await expect.poll(()=>audio.evaluate(element=>element.duration)).toBe(8);
  await voice.getByRole("button",{name:"Play reference voice"}).click();
  await expect(voice.getByRole("button",{name:"Pause reference voice"})).toBeVisible();
  await voice.getByRole("button",{name:"Pause reference voice"}).click();
  expect(await audio.evaluate(element=>element.paused)).toBe(true);
  const slider=voice.getByRole("slider",{name:"Reference voice position"});
  await slider.focus();
  await slider.press("End");
  await expect.poll(()=>audio.evaluate(element=>element.currentTime)).toBe(8);
  await slider.press("Home");
  await expect.poll(()=>audio.evaluate(element=>element.currentTime)).toBe(0);
  await expect(voice.getByRole("link",{name:"Download reference audio"})).toHaveAttribute("href","/reference.wav");
});


test("visual and vocal observations appear in separate sections", async ({page}) => {
  await page.route(`**/api/runs/${runId}`, route=>route.fulfill({json:{
    run_id:runId,status:"success",stage:"complete",outputs:{},original_video_url:"/test-video.mp4",
    results:{nonverbal_feedback:[{start_time:"00:02.000",end_time:"00:03.000",content:"Look toward the camera."}],
      vocal_feedback:[{start_time:"00:06.000",end_time:"00:08.000",content:"Pause between the two ideas."}]},
  }}));
  await page.goto(`/evaluation?run=${runId}`);
  const visual=page.getByRole("region",{name:"Nonverbal delivery",exact:true});
  const vocal=page.getByRole("region",{name:"Vocal delivery",exact:true});
  await expect(visual).toContainText("Look toward the camera.");
  await expect(visual).not.toContainText("Pause between");
  await expect(vocal).toContainText("Pause between the two ideas.");
  await expect(vocal).not.toContainText("Look toward");
  await page.getByLabel("Original recording",{exact:true}).evaluate(video=>{
    Object.defineProperty(video,"currentTime",{configurable:true,writable:true,value:0});
    video.play=async()=>{};
  });
  await vocal.getByRole("button",{name:/00:06/}).click();
  expect(await page.getByLabel("Original recording",{exact:true}).evaluate(video=>video.currentTime)).toBe(6);
});

test("legacy sessions distinguish unavailable vocal analysis from an empty result", async ({page}) => {
  await page.route(`**/api/runs/${runId}`,route=>route.fulfill({json:{
    run_id:runId,status:"success",stage:"complete",outputs:{},results:{nonverbal_feedback:[]},
  }}));
  await page.goto(`/evaluation?run=${runId}`);
  await expect(page.getByRole("region",{name:"Vocal delivery",exact:true})).toContainText("not available for this saved session");
  await expect(page.getByRole("region",{name:"Nonverbal delivery",exact:true})).toContainText("No clear issues");
});
