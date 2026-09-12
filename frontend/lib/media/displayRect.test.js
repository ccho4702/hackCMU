import { describe, expect, it } from "vitest";
import { computeVideoDisplayRect, landmarkToScreenPoint } from "@/lib/media/displayRect";

describe("video display rect", () => {
  it("letterboxes a wide video in a tall container", () => {
    const rect = computeVideoDisplayRect(200, 400, 1920, 1080);
    expect(rect.width).toBe(200);
    expect(rect.height).toBeCloseTo((200 * 1080) / 1920);
    expect(rect.x).toBe(0);
    expect(rect.y).toBeCloseTo((400 - rect.height) / 2);
  });

  it("pillarboxes a tall video in a wide container", () => {
    const rect = computeVideoDisplayRect(400, 200, 1080, 1920);
    expect(rect.height).toBe(200);
    expect(rect.x).toBeGreaterThan(0);
  });

  it("maps normalized landmarks into the displayed video rectangle", () => {
    const rect = computeVideoDisplayRect(400, 200, 200, 100);
    const point = landmarkToScreenPoint({ x: 0.5, y: 0.5 }, rect);
    expect(point.x).toBeCloseTo(rect.x + rect.width / 2);
    expect(point.y).toBeCloseTo(rect.y + rect.height / 2);
  });
});
