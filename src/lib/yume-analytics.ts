const SESSION_KEY = "yume-analytics-session";
const SESSION_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 2500;

type StoredSession = {
  id?: unknown;
  lastActivity?: unknown;
  lastPath?: unknown;
  lastEventAt?: unknown;
};

/** Record an SPA or route pageview without blocking navigation. */
export function trackYumePage(path: string): void {
  if (typeof window === "undefined") return;
  const safePath = path.startsWith("/") ? path.split("?")[0].slice(0, 180) : "/";
  const now = Date.now();
  let sessionId: string;
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "null") as StoredSession | null;
    const valid = typeof stored?.id === "string" && SESSION_PATTERN.test(stored.id);
    const active = valid && typeof stored?.lastActivity === "number" && now - stored.lastActivity < SESSION_TIMEOUT_MS;
    sessionId = active ? stored!.id as string : window.crypto.randomUUID();
    if (active && stored?.lastPath === safePath && typeof stored.lastEventAt === "number" && now - stored.lastEventAt < DUPLICATE_WINDOW_MS) {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...stored, lastActivity: now }));
      return;
    }
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      id: sessionId,
      lastActivity: now,
      lastPath: safePath,
      lastEventAt: now,
    }));
  } catch {
    sessionId = window.crypto.randomUUID();
  }
  fetch("/api/analytics", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: safePath, sessionId }),
  }).catch(() => {
    // Analytics must never interrupt page navigation.
  });
}
