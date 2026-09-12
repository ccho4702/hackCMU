"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiUpload } from "@/lib/api";

export default function Home() {
  const [health, setHealth] = useState("checking...");
  const [message, setMessage] = useState("hello from Next.js");
  const [echo, setEcho] = useState(null);
  const [upload, setUpload] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiGet("/health")
      .then((res) => setHealth(res.status))
      .catch((e) => setHealth(`error: ${e.message}`));
  }, []);

  async function sendEcho() {
    setError(null);
    try {
      setEcho(await apiPost("/echo", { message }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function sendFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      setUpload(await apiUpload("/upload", file));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-8 px-6 py-16 font-sans">
      <h1 className="text-2xl font-semibold">Backend connection test</h1>

      <section>
        <h2 className="font-medium">GET /api/health</h2>
        <p className="font-mono text-sm">{health}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">POST /api/echo</h2>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border px-2 py-1"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button className="rounded bg-foreground px-3 py-1 text-background" onClick={sendEcho}>
            Send
          </button>
        </div>
        {echo && <pre className="font-mono text-sm">{JSON.stringify(echo)}</pre>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">POST /api/upload</h2>
        <input type="file" onChange={sendFile} />
        {upload && <pre className="font-mono text-sm">{JSON.stringify(upload, null, 2)}</pre>}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
