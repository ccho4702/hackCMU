// 가짜 로그인 세션. 백엔드 POST /api/auth/login 이 돌려준 {user_id, name, email} 을 localStorage 에 둔다.
// 이후 모든 /api 요청은 lib/coaching-api.js 가 X-User-Id 헤더로 붙인다.

const USER_KEY = "rehearse.user";
// 파이프라인의 user_id. 로그인하면 로그인 id 로 통일한다. 음성 클론은 녹음마다 새로 생성한다.
const LEGACY_ID_KEY = "rehearse.userId";
export const USER_EVENT = "rehearse:user";

export function getUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    const user = raw ? JSON.parse(raw) : null;
    return user && typeof user.user_id === "string" ? user : null;
  } catch {
    return null;
  }
}

export function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify({ user_id: user.user_id, name: user.name, email: user.email }));
  localStorage.setItem(LEGACY_ID_KEY, user.user_id);
  window.dispatchEvent(new Event(USER_EVENT));
}

export function clearUser() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_ID_KEY);
  window.dispatchEvent(new Event(USER_EVENT));
}

export function loginHref(next) {
  return `/login?next=${encodeURIComponent(next && next.startsWith("/") ? next : "/")}`;
}

// /api/pipeline 에 보낼 user_id. 로그인했으면 그 id, 아니면 예전처럼 익명 id (기존 동작 유지).
export function pipelineUserId() {
  const user = getUser();
  if (user) return user.user_id;
  let id = localStorage.getItem(LEGACY_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(LEGACY_ID_KEY, id);
  }
  return id;
}
