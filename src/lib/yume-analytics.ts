const SESSION_KEY = "yume-analytics-session";
const VISITOR_KEY = "yume-analytics-visitor-id";
const ID_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 2500;

type StoredSession = {
  id?: unknown;
  lastActivity?: unknown;
  lastPath?: unknown;
  lastEventAt?: unknown;
};

/**
 * Record an SPA or route pageview. Random first-party IDs mean raw IP addresses
 * are not needed for visitor counts. If browser storage is disabled, skip tracking.
 */
export function trackYumePage(path: string): void {
  if (typeof window === "undefined") return;
  const safePath = path.startsWith("/") ? path.split("?")[0].slice(0, 180) : "/";
  const now = Date.now();

  let sessionId: string;
  let visitorId: string;
  try {
    visitorId = window.localStorage.getItem(VISITOR_KEY) ?? "";
    if (!ID_PATTERN.test(visitorId)) {
      visitorId = window.crypto.randomUUID();
      window.localStorage.setItem(VISITOR_KEY, visitorId);
    }

    const stored = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? "null") as StoredSession | null;
    const valid = typeof stored?.id === "string" && ID_PATTERN.test(stored.id);
    const active = valid && typeof stored?.lastActivity === "number" && now - stored.lastActivity < SESSION_TIMEOUT_MS;
    sessionId = active ? stored!.id as string : window.crypto.randomUUID();

    if (active && stored?.lastPath === safePath && typeof stored.lastEventAt === "number" && now - stored.lastEventAt < DUPLICATE_WINDOW_MS) {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify({ ...stored, lastActivity: now }));
      return;
    }

    window.localStorage.setItem(SESSION_KEY, JSON.stringify({
      id: sessionId,
      lastActivity: now,
      lastPath: safePath,
      lastEventAt: now,
    }));
  } catch {
    // Do not fall back to per-page IDs: that would inflate visits when storage is blocked.
    return;
  }

  fetch("/api/analytics", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: safePath, sessionId, visitorId }),
  }).catch(() => {
    // Analytics must never interrupt page navigation.
  });
}
