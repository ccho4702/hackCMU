// Registered demo profiles persist locally; guest identities live in this tab.
const USER_KEY = "rehearse.user";
const GUEST_KEY = "optune.guest";
const GUEST_DATA_PREFIX = "optune.guest-data.";
const LEGACY_ID_KEY = "rehearse.userId";
export const USER_EVENT = "rehearse:user";

function readUser(storage, key) {
  try {
    const user = JSON.parse(storage.getItem(key) || "null");
    return user && typeof user.user_id === "string" && user.user_id ? user : null;
  } catch { return null; }
}

export function getUser() {
  if (typeof window === "undefined") return null;
  try { return readUser(sessionStorage, GUEST_KEY) || readUser(localStorage, USER_KEY); }
  catch { return null; }
}

function clearGuest() {
  const guest = readUser(sessionStorage, GUEST_KEY);
  if (guest) {
    const prefix = `${GUEST_DATA_PREFIX}${guest.user_id}.`;
    Object.keys(sessionStorage).filter(key => key.startsWith(prefix)).forEach(key => sessionStorage.removeItem(key));
  }
  sessionStorage.removeItem(GUEST_KEY);
}

export function setUser(user) {
  clearGuest();
  localStorage.setItem(USER_KEY, JSON.stringify({ user_id: user.user_id, name: user.name, email: user.email }));
  localStorage.setItem(LEGACY_ID_KEY, user.user_id);
  window.dispatchEvent(new Event(USER_EVENT));
}

export function setGuestUser(user) {
  if (!user?.is_guest || typeof user.user_id !== "string" || !user.user_id) throw new Error("Could not start guest mode.");
  clearGuest();
  sessionStorage.setItem(GUEST_KEY, JSON.stringify({user_id:user.user_id,name:"Guest",email:null,is_guest:true}));
  window.dispatchEvent(new Event(USER_EVENT));
}

export function clearUser() {
  if (readUser(sessionStorage, GUEST_KEY)) clearGuest();
  else {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LEGACY_ID_KEY);
  }
  window.dispatchEvent(new Event(USER_EVENT));
}

// Captures the current guest ID so an in-flight response cannot populate a new guest's state.
export function coachingStorage() {
  const user = getUser();
  if (!user?.is_guest) return localStorage;
  const prefix = `${GUEST_DATA_PREFIX}${user.user_id}.`;
  return {
    getItem: key => sessionStorage.getItem(prefix + key),
    setItem: (key,value) => sessionStorage.setItem(prefix + key,value),
    removeItem: key => sessionStorage.removeItem(prefix + key),
  };
}

export function safeNextPath(target, fallback="/") {
  if (typeof target !== "string" || !target.startsWith("/")) return fallback;
  try {
    const url = new URL(target, "https://optune.invalid");
    return url.origin === "https://optune.invalid" ? url.pathname + url.search + url.hash : fallback;
  } catch { return fallback; }
}

export function loginHref(next) {
  return `/login?next=${encodeURIComponent(safeNextPath(next))}`;
}

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
