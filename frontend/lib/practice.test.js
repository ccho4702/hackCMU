import { expect, test } from "vitest";
import { audioProgress } from "./practice";

test("overall progress is continuous across word boundaries and clamped to the clip",()=>{
  expect(audioProgress(3,10).percent).toBe(30);
  expect(audioProgress(5.5,10).percent).toBeCloseTo(55);
  expect(audioProgress(20,10)).toEqual({total:10,elapsed:10,remaining:0,percent:100});
  expect(audioProgress(-1,10).percent).toBe(0);
});

test("metadata not loaded yet cannot create invalid progress",()=>{
  for(const duration of [0,NaN,Infinity,undefined]) {
    expect(audioProgress(5,duration)).toEqual({total:0,elapsed:0,remaining:0,percent:0});
  }
});
