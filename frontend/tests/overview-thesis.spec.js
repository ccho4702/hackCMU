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
