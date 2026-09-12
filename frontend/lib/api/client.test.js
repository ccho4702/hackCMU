import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

it("routes recording session requests through the current frontend by default", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
  const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({sessionId:"test-session"}),{status:201,headers:{"Content-Type":"application/json"}}));
  vi.stubGlobal("fetch",fetchMock);
  const {createLiveSession}=await import("./client");
  await expect(createLiveSession()).resolves.toEqual({sessionId:"test-session"});
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/live/sessions",{method:"POST"});
});
