"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiPost } from "@/lib/coaching-api";
import { safeNextPath, setGuestUser } from "@/lib/session";

export default function GuestModeButton({ fullWidth=false }) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const pending=useRef(false);
  const pathname=usePathname();
  const router=useRouter();
  async function start() {
    if(pending.current) return;
    pending.current=true;setBusy(true);setError("");
    try {
      const guest=await apiPost("/auth/guest",{});
      setGuestUser(guest);
      if(pathname==="/login") router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    } catch(e) { setError(e instanceof Error?e.message:"Guest mode could not start."); }
    finally { pending.current=false;setBusy(false); }
  }
  return <div className={`guest-entry ${fullWidth?"guest-entry-full":""}`}>
    <button type="button" className="guest-mode-button" onClick={start} disabled={busy} aria-busy={busy}>{busy?"Starting…":fullWidth?"Continue as guest":"Guest mode"}</button>
    {error&&<p className="guest-entry-error" role="alert">{error}</p>}
  </div>;
}
