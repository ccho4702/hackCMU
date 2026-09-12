"use client";

import { LiveWorkspace } from "@/components/live/LiveWorkspace";
import { useRequireUser } from "@/lib/useUser";

export default function LivePage() {
  const user = useRequireUser();   // 로그인 없으면 /login?next=/live
  if (!user) return null;
  return <LiveWorkspace />;
}
