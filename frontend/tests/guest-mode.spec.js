import {test,expect} from '@playwright/test';
const runId='a'.repeat(32);
async function guestApi(page){
 let guests=0,logins=0,uploads=0;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/guest'){guests++;return route.fulfill({status:201,json:{user_id:String(guests).padStart(24,'a'),name:'Guest',email:null,is_guest:true}});}
  if(path==='/api/auth/login'){logins++;return route.fulfill({status:500,json:{detail:'Login should not be needed'}});}
  if(path==='/api/capabilities')return route.fulfill({json:{landmarks:false}});
  if(path==='/api/pipeline'){
   uploads++;
   const id=String(guests).padStart(24,'a');
   expect(route.request().headers()['x-user-id']).toBe(id);
   expect(route.request().postDataBuffer().toString()).toContain(`name="user_id"\r\n\r\n${id}`);
   return route.fulfill({status:202,json:{run_id:runId,status:'queued',outputs:{}}});
  }
  if(path===`/api/runs/${runId}`)return route.fulfill({json:{run_id:runId,status:'success',stage:'complete',outputs:{},results:{script_feedback:{original_script:'Hello there.',improved_script:'Hello there.',issues:[]}}}});
  if(path===`/api/runs/${runId}/practice`)return route.fulfill({json:{run_id:runId,script:'Hello there.',reference_audio_url:'/demo/optune-demo.mp4',duration_seconds:3,max_trial_seconds:30,words:[{text:'Hello',t0:0,t1:1},{text:'there.',t0:1,t1:2}],model:{status:'ready'},trials:[],trial_count:0}});
  if(path==='/api/me/runs')return route.fulfill({json:{runs:[],count:0}});
  if(path.endsWith('/leaderboard'))return route.fulfill({json:{run_id:runId,trials:[],trial_count:0,best_trial_id:null}});
  return route.fulfill({status:404,json:{detail:'Test asset unavailable'}});
 });
 return ()=>({guests,logins,uploads});
}
test('guest can upload, review, practice and open history without the login form',async({page})=>{
 const counts=await guestApi(page);
 await page.goto('/');await page.getByRole('link',{name:'Enter studio',exact:true}).click();
 await page.getByRole('button',{name:'Guest mode',exact:true}).click();
 await expect(page.getByRole('button',{name:'End guest session'})).toBeVisible();
 await page.goto('/live');await expect(page.getByRole('button',{name:'Start live analysis',exact:true})).toBeVisible();
 await page.goto('/streaming');await page.locator('input[type=file]').setInputFiles({name:'talk.mp4',mimeType:'video/mp4',buffer:Buffer.from('test recording')});
 await expect(page).toHaveURL(new RegExp(`/evaluation\\?run=${runId}$`));
 await expect(page.getByRole('region',{name:'Improved script',exact:true})).toContainText('Hello there.');
 await page.goto(`/practice?run=${runId}`);await expect(page.getByRole('button',{name:'Start voice trial',exact:true})).toBeVisible();
 await page.goto('/leaderboard');await expect(page.getByText('No recordings yet.',{exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('button',{name:'End guest session'})).toBeVisible();
 expect(counts()).toEqual({guests:1,logins:0,uploads:1});
 expect(await page.evaluate(()=>localStorage.getItem('rehearse.user'))).toBeNull();
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('optune.guest')).is_guest)).toBe(true);
});
test('guest entry from login preserves the requested destination on mobile',async({page})=>{
 await guestApi(page);await page.setViewportSize({width:390,height:844});
 await page.goto('/login?next=%2Flive');
 await page.getByRole('button',{name:'Continue as guest',exact:true}).click();
 await expect(page).toHaveURL(/\/live$/);
 await expect(page.getByRole('button',{name:'Start live analysis',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('leaving and restarting guest mode uses a fresh identity',async({page})=>{
 const count=await guestApi(page);await page.goto('/login');
 await page.getByRole('button',{name:'Continue as guest',exact:true}).click();
 await page.getByRole('link',{name:'Enter studio',exact:true}).click();
 const first=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('optune.guest')).user_id);
 await page.getByRole('button',{name:'End guest session'}).click();
 await page.getByRole('link',{name:'Enter studio',exact:true}).click();
 await page.getByRole('button',{name:'Guest mode',exact:true}).click();
 await expect(page.getByRole('button',{name:'End guest session'})).toBeVisible();
 const second=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('optune.guest')).user_id);
 expect(second).not.toBe(first);expect(count().guests).toBe(2);
});
