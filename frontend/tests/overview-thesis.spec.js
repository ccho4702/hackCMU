import {test,expect} from '@playwright/test';

test('overview states the measurement thesis before the product demo',async({page})=>{
  await page.goto('/');
  const thesis=page.getByRole('region',{name:"You can't optimize what you can't measure."});
  await expect(thesis.getByText('THE PROBLEM WITH PITCHING',{exact:true})).toBeVisible();
  await expect(thesis.getByText('time on camera')).toBeVisible();
  await expect(thesis.getByText('pronunciation')).toBeVisible();
  await expect(thesis.getByText('objective function')).toBeVisible();
  await expect(page.getByRole('region',{name:'See Optune in action'})).toBeVisible();
});

test('overview thesis stays inside the mobile layout',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const thesis=page.getByRole('region',{name:"You can't optimize what you can't measure."});
  await thesis.scrollIntoViewIfNeeded();
  await expect(thesis.getByText('Score again')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
