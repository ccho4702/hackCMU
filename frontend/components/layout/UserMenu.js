"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import GuestModeButton from "@/components/GuestModeButton";
import { useUser } from "@/lib/useUser";
import { clearUser, loginHref } from "@/lib/session";

// 헤더 오른쪽. 로그인 전엔 "Log in", 후엔 이름 + 로그아웃.
export function UserMenu() {
  const user = useUser();
  const router = useRouter();
  const pathname = usePathname();
  if (user === undefined) return null;
  if (!user) {
    return (
      <div className="user-entry-actions"><GuestModeButton />
      <Link
        href={loginHref(pathname)} onClick={event=>{event.preventDefault();router.push(loginHref(pathname+window.location.search));}}
        className="flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#172554]"
      >
        <UserRound className="size-3.5" /> Log in
      </Link></div>
    );
  }
  if (user.is_guest) return (
    <div className="guest-session-menu">
      <span>Guest mode</span>
      <Link href={loginHref(pathname)} onClick={event=>{event.preventDefault();router.push(loginHref(pathname+window.location.search));}}>Log in</Link>
      <button type="button" aria-label="End guest session" onClick={()=>{clearUser();router.replace("/");}}><LogOut size={14}/></button>
    </div>
  );
  return (
    <div className="flex items-center gap-2 rounded-full bg-slate-900/[0.04] py-1 pl-3 pr-1 text-xs">
      <UserRound className="size-3.5 text-primary" />
      <span className="max-w-[10rem] truncate font-medium text-slate-900" title={user.email}>{user.name}</span>
      <button
        type="button"
        aria-label="Log out"
        onClick={() => { clearUser(); router.replace("/login"); }}
        className="grid size-6 place-items-center rounded-full text-slate-400 transition-colors hover:bg-white hover:text-slate-900"
      >
        <LogOut className="size-3.5" />
      </button>
    </div>
  );
}
