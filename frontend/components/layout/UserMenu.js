"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
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
      <Link
        href={loginHref(pathname)}
        className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
      >
        <UserRound className="size-3.5" /> Log in
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-slate-200">
      <UserRound className="size-3.5 text-primary" />
      <span className="max-w-[10rem] truncate font-medium text-slate-900" title={user.email}>{user.name}</span>
      <button
        type="button"
        aria-label="Log out"
        onClick={() => { clearUser(); router.replace("/login"); }}
        className="grid size-6 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <LogOut className="size-3.5" />
      </button>
    </div>
  );
}
