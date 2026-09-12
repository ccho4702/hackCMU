import {test,expect} from '@playwright/test';

test('overview labels the demo and plays it without recording or provider requests',async({page})=>{
  const providerRequests=[];
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))providerRequests.push(r.url());});
  await page.goto('/');
  const demo=page.getByRole('region',{name:'See Optune in action'});
  await expect(demo.getByText('PRODUCT DEMO',{exact:true})).toBeVisible();
  const video=demo.getByLabel('Optune product demo video');
  await expect(video).toHaveAttribute('preload','none');
  expect(await video.evaluate(v=>v.autoplay)).toBe(false);
  expect(await video.evaluate(v=>v.paused)).toBe(true);
  await video.evaluate(v=>v.play());
  await expect.poll(()=>video.evaluate(v=>v.currentTime)).toBeGreaterThan(.1);
  expect(await video.evaluate(v=>v.duration)).toBeCloseTo(116.245,1);
  await video.evaluate(v=>{v.pause();v.currentTime=80;});
  await expect.poll(()=>video.evaluate(v=>v.currentTime)).toBeCloseTo(80,0);
  await expect(page.getByRole('link',{name:'Start recording',exact:true})).toHaveAttribute('href','/live');
  expect(providerRequests).toEqual([]);
});

test('demo stays within the mobile layout and supports byte range playback',async({page,request})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const demo=page.getByRole('region',{name:'See Optune in action'});
  await demo.scrollIntoViewIfNeeded();
  await expect(demo.getByLabel('Optune product demo video')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const response=await request.get('/demo/optune-demo.mp4',{headers:{Range:'bytes=0-1023'}});
  expect(response.status()).toBe(206);
  expect(response.headers()['content-type']).toContain('video/mp4');
  expect(response.headers()['content-range']).toMatch(/^bytes 0-1023\/[0-9]+$/);
});
