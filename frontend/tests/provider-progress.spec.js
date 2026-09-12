import {test,expect} from '@playwright/test';
const runId='d'.repeat(32);
const stages=[['nonverbal_analysis','Gemini','reviewing your delivery'],['transcription','ElevenLabs','transcribing your speech'],['script_analysis','Gemini','refining your script'],['voice_cloning','ElevenLabs','creating your voice'],['speech_generation','ElevenLabs','generating your reference']];
for(const [stage,provider,title] of stages){
 test(`${stage} reports the correct provider and current action`,async({page})=>{
  await page.route(`**/api/runs/${runId}`,r=>r.fulfill({json:{run_id:runId,status:'running',stage,outputs:{},results:{}}}));
  await page.goto(`/evaluation?run=${runId}`);
  const progress=page.getByRole('region',{name:'Processing your recording'});
  await expect(progress.getByRole('status')).toContainText(`${provider} is ${title}`);
  await expect(progress.locator('li[aria-current="step"]')).toHaveCount(1);
  if(['voice_cloning','speech_generation'].includes(stage)){
   const voice=page.getByRole('region',{name:'Reference voice',exact:true});
   await expect(voice.locator('[data-provider="ElevenLabs"]')).toBeVisible();
   await expect(voice.locator('[data-provider="Gemini"]')).toHaveCount(0);
  }
 });
}
test('a failed job stops all provider loading states',async({page})=>{
 await page.route(`**/api/runs/${runId}`,r=>r.fulfill({json:{run_id:runId,status:'failed',stage:'speech_generation',outputs:{},results:{},error_message:'Voice generation failed.'}}));
 await page.goto(`/evaluation?run=${runId}`);
 await expect(page.locator('.error-banner[role=alert]')).toContainText('Voice generation failed');
 await expect(page.locator('.provider-progress')).toHaveCount(0);
});
test('loading widgets fit mobile and respect reduced motion',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});
 await page.route(`**/api/runs/${runId}`,r=>r.fulfill({json:{run_id:runId,status:'running',stage:'speech_generation',outputs:{},results:{}}}));
 await page.goto(`/evaluation?run=${runId}`);
 await expect(page.getByRole('status')).toContainText('ElevenLabs');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 expect(await page.evaluate(()=>document.getAnimations().length)).toBe(0);
});
