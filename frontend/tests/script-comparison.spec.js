import { test, expect } from "@playwright/test";
const runId="b".repeat(32);
const original="Hi everyone. Um, today I want to talk about our project. So, public speaking is something a lot of people find hard. We made a tool that looks at your recording and helps you find things to improve. It looks at how you present and what you say. Then you can practice again, and hopefully get better. I think this could be useful for students and anyone preparing a presentation.";
const improved="Hello everyone. Today, I’ll introduce our presentation practice tool.\n\nPublic speaking can be challenging. Our tool helps you turn each recording into a focused practice session by reviewing both your delivery and your script.\n\nYou receive specific feedback, a clearer version of your presentation, and a voice reference to practice with. Record another take to see how your delivery changes.\n\nOur goal is to help students and presenters practice with a clear sense of what to improve next.";

async function showReview(page, pending=false) {
  await page.route(`**/api/runs/${runId}`,route=>route.fulfill({json:{
    run_id:runId,status:pending?"failed":"success",stage:pending?"script_analysis":"complete",outputs:{},
    original_video_url:"/test-video.mp4",
    results:{transcript:{text:original},nonverbal_feedback:[],...(!pending?{script_feedback:{original_script:original,improved_script:improved,issues:[]}}:{})},
  }}));
  await page.goto(`/evaluation?run=${runId}`);
}

test("desktop shows both scripts together and emphasizes the improved version",async({page})=>{
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
  expect(r.width).toBeGreaterThan(o.width);
  const recording=await page.getByRole("heading",{name:"Original recording",exact:true}).boundingBox();
  expect(r.y+r.height).toBeLessThan(recording.y);
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
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:"test-results/script-comparison-mobile.png",fullPage:true});
});

test("the original script remains readable if revision fails",async({page})=>{
  await showReview(page,true);
  await expect(page.getByRole("region",{name:"Original script",exact:true})).toContainText(original);
  await expect(page.getByRole("region",{name:"Improved script",exact:true})).toContainText("Your improved script will appear here.");
});
