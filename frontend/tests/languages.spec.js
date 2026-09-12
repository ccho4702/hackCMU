import { test, expect } from "@playwright/test";


test.beforeEach(async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('rehearse.user',JSON.stringify({
    user_id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:'Test User',email:'tester@example.test',
  })));
});

const analysisId = "anl_language_test";
const runId = "e".repeat(32);

async function mockAnalysis(page, language, scriptStyle="presentation") {
  let uploads = 0;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/pipeline") {
      uploads++;
      const body = route.request().postDataBuffer().toString();
      expect(body).toMatch(new RegExp(`name="language"\\r\\n\\r\\n${language}\\r\\n`));
      expect(body).not.toContain('name="accent"');
      expect(body).toMatch(new RegExp(`name="script_style"\\r\\n\\r\\n${scriptStyle}\\r\\n`));
      return route.fulfill({status:202,json:{run_id:runId,status:"queued",outputs:{}}});
    }
    if (path === "/api/v1/analyses") return route.fulfill({status:202,json:{analysisId,status:"queued"}});
    if (path === "/api/v1/live/sessions") return route.fulfill({status:201,json:{analysisId,sessionId:analysisId,mock:false}});
    if (path.endsWith("/stop")) return route.fulfill({json:{analysisId,status:"completed"}});
    if (path.endsWith("/events")) return route.fulfill({contentType:"text/event-stream",body:""});
    return route.fulfill({json:{analysisId,status:"processing",progress:0,phase:"Processing",mock:false}});
  });
  return () => uploads;
}

for (const language of ["en", "ko"]) {
  test(`uploaded presentation sends selected ${language}`, async ({page}) => {
    const uploads = await mockAnalysis(page, language);
    await page.goto("/streaming");
    const select = page.getByRole("combobox", {name:"Presentation language"});
    await select.selectOption(language);
    await page.screenshot({path:`test-results/language-upload-${language}.png`,fullPage:true});
    await page.locator('input[type="file"]').setInputFiles({name:"talk.mp4",mimeType:"video/mp4",buffer:Buffer.from("test recording")});
    await expect(page).toHaveURL(new RegExp(`/evaluation\\?run=${runId}$`));
    expect(uploads()).toBe(1);

  });
}

test("live recording keeps Korean selected until stop and upload", async ({page}) => {
  const uploads = await mockAnalysis(page,"ko");
  await page.addInitScript(() => {
    Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
    Object.defineProperty(HTMLMediaElement.prototype,"srcObject",{configurable:true,get(){return this.__stream;},set(value){this.__stream=value;}});
    HTMLMediaElement.prototype.play=async()=>{};
    window.MediaRecorder=class {
      static isTypeSupported(){return true;}
      constructor(){this.mimeType="video/webm";this.state="inactive";}
      start(){this.state="recording";}
      stop(){this.state="inactive";queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(["test"],{type:this.mimeType})});this.onstop?.();});}
    };
  });
  await page.goto("/live");
  const select=page.getByRole("combobox",{name:"Presentation language"});
  await select.selectOption("ko");
  await page.screenshot({path:"test-results/language-live-ko.png",fullPage:true});
  await page.getByRole("button",{name:"Start live analysis",exact:true}).click();
  await expect(select).toBeDisabled();
  await page.getByRole("button",{name:"Stop session",exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/analysis/${analysisId}$`));
  expect(uploads()).toBe(1);
});


for (const style of ["presentation","interview","formal","informal","friend","pitch"]) {
  test(`script scenario ${style} is sent with language`, async ({page}) => {
    const count=await mockAnalysis(page,"en",style);
    await page.goto("/streaming");
    const settings=page.getByRole("region",{name:"Session settings"});
    await settings.getByRole("combobox",{name:"Script style"}).selectOption(style);
    const settingsBox=await settings.boundingBox();
    const stageBox=await page.getByLabel("Live camera preview").boundingBox();
    expect(settingsBox.y+settingsBox.height).toBeLessThanOrEqual(stageBox.y);
    if(style==="interview") await page.screenshot({path:"test-results/session-settings-desktop.png",fullPage:true});
    await page.locator('input[type="file"]').setInputFiles({name:"talk.mp4",mimeType:"video/mp4",buffer:Buffer.from("recording")});
    await expect(page).toHaveURL(new RegExp(`/evaluation\\?run=${runId}$`));
    expect(count()).toBe(1);
  });
}

test("session settings stay readable on mobile",async({page})=>{
  await mockAnalysis(page,"en");
  await page.setViewportSize({width:390,height:844});
  await page.goto("/live");
  await expect(page.getByRole("combobox",{name:"Script style"})).toBeVisible();
  await expect(page.getByRole("combobox",{name:"Target accent"})).toHaveCount(0);
  const stage=await page.locator(".live-camera-stage").boundingBox();
  const start=await page.getByRole("button",{name:"Start live analysis",exact:true}).boundingBox();
  expect(start.y+start.height).toBeLessThanOrEqual(stage.y+stage.height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:"test-results/session-settings-mobile.png",fullPage:true});
});
