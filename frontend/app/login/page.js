"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Card, PageShell } from "@/components/ui/studio";
import { apiPost } from "@/lib/coaching-api";
import GuestModeButton from "@/components/GuestModeButton";
import { setUser, safeNextPath } from "@/lib/session";

// 가짜 로그인: 이름과 이메일만. 같은 이메일이면 같은 사용자로 이어진다.
export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // ?next=/practice 처럼 돌아갈 곳. 제출 시점에 읽는다 (effect 안 setState 를 피하려고).
  function nextPath() {
    const target = new URLSearchParams(window.location.search).get("next");
    return safeNextPath(target);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const user = await apiPost("/auth/login", { name: name.trim(), email: email.trim() });
      setUser(user);
      router.replace(nextPath());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setBusy(false);
    }
  }

  const field =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <PageShell title="Sign in" subtitle="Your recordings and practice history follow your email">
      <Card className="mx-auto w-full max-w-md">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <LogIn className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Welcome back</h1>
            <p className="text-sm text-slate-500">No password. Same email, same history.</p>
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="text-sm font-medium text-slate-700">
            Name
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jimin Kim" autoComplete="name" required />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Email
            <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@andrew.cmu.edu" autoComplete="email" required />
          </label>
          {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Continue"}
          </button>
        </form>
        <div className="login-guest-option"><span>or</span><GuestModeButton fullWidth /><p>No email needed. Guest history is tied to this browser tab.</p></div>
      </Card>
    </PageShell>
  );
}
