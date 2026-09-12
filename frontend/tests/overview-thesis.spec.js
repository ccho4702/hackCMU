import {test,expect} from '@playwright/test';

test('compact delivery overview stays before the product demo',async({page})=>{
  await page.goto('/');
  await page.getByRole('link',{name:'Enter studio',exact:true}).click();
  const thesis=page.getByRole('region',{name:'Know what to improve.'});
  await expect(thesis.getByRole('heading',{name:'Visual delivery'})).toBeVisible();
  await expect(thesis.getByRole('heading',{name:'Voice delivery'})).toBeVisible();
  const section=await thesis.boundingBox();
  const demo=await page.getByRole('region',{name:'See Optune in action'}).boundingBox();
  expect(section.y+section.height).toBeLessThanOrEqual(demo.y);
});

test('mobile intro can be skipped without motion and both delivery categories fit',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:"You can't optimize what you can't measure.",level:1})).toBeVisible();
  expect(await page.evaluate(()=>document.getAnimations().length)).toBe(0);
  await page.getByRole('link',{name:'Enter studio',exact:true}).press('Enter');
  await expect(page.locator('#studio-content')).toBeFocused();
  const thesis=page.getByRole('region',{name:'Know what to improve.'});
  await thesis.scrollIntoViewIfNeeded();
  await expect(thesis.getByRole('heading',{name:'Visual delivery'})).toBeVisible();
  await expect(thesis.getByRole('heading',{name:'Voice delivery'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('leaving and returning while the curtain animates does not access detached elements',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('rehearse.user',JSON.stringify({user_id:'a'.repeat(24),name:'Test User',email:'test@example.test'})));
  await page.goto('/');
  for(let visit=0;visit<3;visit++){
    await expect(page.locator('.curtain-intro')).toBeAttached();
    await page.evaluate(()=>{
      window.scrollTo({top:document.querySelector('.curtain-intro').offsetHeight+12,behavior:'instant'});
      window.dispatchEvent(new Event('scroll'));
    });
    await page.getByRole('link',{name:'Record',exact:true}).click();
    await expect(page).toHaveURL(/\/live$/);
    await expect(page.locator('.curtain-intro')).not.toBeVisible();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('.curtain-quote-wrap')).toHaveCSS('opacity','1');
  expect(errors).toEqual([]);
});
