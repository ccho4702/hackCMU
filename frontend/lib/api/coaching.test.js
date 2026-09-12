import { beforeEach, expect, test, vi } from "vitest";
import { beginCoaching } from "./coaching";

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

test("retry preserves the originally selected language and sends multipart data", async () => {
  const fetchMock=vi.spyOn(globalThis,"fetch")
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce({ok:true,headers:new Headers({"content-type":"application/json"}),json:async()=>({run_id:"run-1"})});
  const file=new File(["video"],"talk.mp4",{type:"video/mp4"});
  expect(await beginCoaching(file,"analysis-1","ko")).toBeUndefined();
  expect(await beginCoaching(file,"analysis-1")).toBe("run-1");
  for (const [, request] of fetchMock.mock.calls) {
    expect(request.body.get("language")).toBe("ko");
    expect(request.body.get("file").name).toBe("talk.mp4");
  }
  expect(await beginCoaching(file,"analysis-1","en")).toBe("run-1");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
