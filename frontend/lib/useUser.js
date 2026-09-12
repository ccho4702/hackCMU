"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getUser, loginHref, USER_EVENT } from "@/lib/session";

// undefined = 아직 모름(SSR/첫 렌더), null = 로그인 안 함, object = 로그인 사용자
export function useUser() {
  const [user, setUserState] = useState(undefined);
  useEffect(() => {
    const sync = () => setUserState(getUser());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(USER_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(USER_EVENT, sync);
    };
  }, []);
  return user;
}

// 로그인 필요한 페이지에서 호출. 없으면 /login?next=현재경로 로 보낸다.
export function useRequireUser() {
  const user = useUser();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (user === null) router.replace(loginHref(`${pathname}${window.location.search}`));
  }, [user, pathname, router]);
  return user;
}
