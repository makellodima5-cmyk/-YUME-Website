import { env as cloudflareEnv } from "cloudflare:workers";
import { getR2Anime } from "@/data/catalog-r2.server";
import { hasAdminPasswordSession } from "@/lib/admin-password.server";

type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> };
type Environment = Record<string, unknown> & {
  YUME_DB?: Database;
  YUME_AUTH_SESSION_SECRET?: string;
  TELEGRAM_ADMIN_ID?: string;
  TELEGRAM_BOT_TOKEN?: string;
};
type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };
type UserSession = { user_id: string; telegram_user_id: string; expires_at: number };

const SESSION_COOKIE = "__Host-yume-session";
const PLUS_PERIOD_SECONDS = 2_592_000;
const LEVELS = [
  { level: 1, name: "Начинающий зритель", min: 0, max: 49, art: "YUBERA_Level_01_Option_A.webp" },
  { level: 2, name: "Любитель аниме", min: 50, max: 149, art: "YUBERA_Level_02.webp" },
  { level: 3, name: "Искатель историй", min: 150, max: 299, art: "YUBERA_Level_03.webp" },
  { level: 4, name: "Исследователь миров", min: 300, max: 499, art: "YUBERA_Level_04.webp" },
  { level: 5, name: "Коллекционер", min: 500, max: 749, art: "YUBERA_Level_05_Transparent.webp" },
  { level: 6, name: "Знаток аниме", min: 750, max: 999, art: "YUBERA_Level_06.webp" },
  { level: 7, name: "Хранитель историй", min: 1000, max: 1499, art: "YUBERA_Level_07_Transparent.webp" },
  { level: 8, name: "Мастер YUBERA", min: 1500, max: 2199, art: "YUBERA_Level_08_Transparent.webp" },
  { level: 9, name: "Архивариус YUBERA", min: 2200, max: 3199, art: "YUBERA_Level_09_Transparent.webp" },
  { level: 10, name: "Легенда YUBERA", min: 3200, max: null, art: "YUBERA_Level_10_New_Design.webp" },
] as const;
const SUPPORT_STATUSES = [
  { level: 0, name: "Пока без статуса", threshold: 0, art: null },
  { level: 1, name: "Союзник", threshold: 50, art: "YUBERA_Support_Status_Level_01_Soyuznik.webp" },
  { level: 2, name: "Сторонник", threshold: 1000, art: "YUBERA_Support_Status_Level_02_Storonnik.webp" },
  { level: 3, name: "Преданный участник", threshold: 2500, art: "YUBERA_Support_Status_Level_03_Predanniy_Uchastnik.webp" },
  { level: 4, name: "Почётный покровитель", threshold: 5000, art: "YUBERA_Support_Status_Level_04_Pochetnyy_Pokrovitel.webp" },
  { level: 5, name: "Легенда YUBERA", threshold: 10000, art: "YUBERA_Support_Status_Level_05_Legenda_YUBERA.webp" },
] as const;
const COVER_KEYS = ["Action", "Adventure_Fantasy", "Romance", "Slice_of_Life", "Thriller_Mystery"] as const;
const COVER_FILES: Record<string, string> = {
  Action: "YUBERA_Collection_Cover_Action.webp",
  Adventure_Fantasy: "YUBERA_Collection_Cover_Adventure_Fantasy.webp",
  Romance: "YUBERA_Collection_Cover_Romance.webp",
  Slice_of_Life: "YUBERA_Collection_Cover_Slice_of_Life.webp",
  Thriller_Mystery: "YUBERA_Collection_Cover_Thriller_Mystery.webp",
};
const SUPPORT_FRAMES: Record<number, string> = {
  1: "YUBERA_Contribution_Avatar_Frame_01_Soyuznik.webp.webp",
  2: "YUBERA_Contribution_Avatar_Frame_02_Storonnik.webp.webp",
  3: "YUBERA_Contribution_Avatar_Frame_03_Predanniy_Uchastnik.webp.webp",
  4: "YUBERA_Contribution_Avatar_Frame_04_Pochetnyy_Pokrovitel.webp",
  5: "YUBERA_Contribution_Avatar_Frame_05_Legenda_YUBERA.webp",
};
const PLUS_FRAMES: Record<number, string> = {
  1: "YUBERA_Plus_Avatar_Frame_01_Sakura_Gold.webp",
  2: "YUBERA_Plus_Avatar_Frame_02_Mystic_Kitsune.webp",
  3: "YUBERA_Plus_Avatar_Frame_03_Samurai_Steel.webp",
  4: "YUBERA_Plus_Avatar_Frame_04_Celestial_Archive.webp",
  5: "YUBERA_Plus_Avatar_Frame_05_Cyberpunk_Neon.webp",
};

function environment(): Environment {
  try {
    const value = cloudflareEnv as unknown as Environment;
    if (value && typeof value === "object") return value;
  } catch {
    const injected = (globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__;
    if (injected && typeof injected === "object") return injected as Environment;
  }
  return {};
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
function sameOrigin(request: Request): boolean {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin !== null) {
    try { return new URL(origin).origin === expected; } catch { return false; }
  }
  const referer = request.headers.get("referer");
  if (referer !== null) {
    try { return new URL(referer).origin === expected; } catch { return false; }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}
function readToken(request: Request): string | null {
  const auth = /^Bearer ([A-Za-z0-9_-]{30,60})$/.exec(request.headers.get("authorization") ?? "");
  if (auth) return auth[1];
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === SESSION_COOKIE) return part.slice(index + 1).trim() || null;
  }
  return null;
}
function hasBearer(request: Request): boolean {
  return /^Bearer [A-Za-z0-9_-]{30,60}$/.test(request.headers.get("authorization") ?? "");
}
function sameOriginOrBearer(request: Request): boolean {
  return hasBearer(request) || sameOrigin(request);
}
async function hashToken(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}
async function authenticate(request: Request, db: Database, env: Environment): Promise<UserSession | null> {
  const token = readToken(request);
  const secret = typeof env.YUME_AUTH_SESSION_SECRET === "string" ? env.YUME_AUTH_SESSION_SECRET : "";
  if (!token || secret.length < 32) return null;
  return db.prepare(
    "SELECT s.user_id, u.telegram_user_id, s.expires_at FROM yume_sessions s " +
    "JOIN yume_users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.provider = 'telegram'",
  ).bind(await hashToken(token, secret)).first<UserSession>().then(row =>
    row && row.expires_at > Date.now() ? row : null,
  );
}
async function isAdmin(request: Request, db: Database, env: Environment, user: UserSession): Promise<boolean> {
  const expectedId = typeof env.TELEGRAM_ADMIN_ID === "string" ? env.TELEGRAM_ADMIN_ID.trim() : "";
  if (!/^\d{1,20}$/.test(expectedId) || user.telegram_user_id !== expectedId) return false;
  try {
    return await hasAdminPasswordSession(request, env as never);
  } catch {
    return false;
  }
}
async function readBody(request: Request, max = 20_000): Promise<Record<string, unknown> | null> {
  try {
    const raw = await request.text();
    if (raw.length > max) return null;
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
function stringValue(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.trim().slice(0, max) : null;
}
function numberParam(value: string | null, fallback = 0): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
function levelForXp(total: number) {
  return LEVELS.filter(level => total >= level.min).at(-1) ?? LEVELS[0];
}
function supportForStars(total: number) {
  return SUPPORT_STATUSES.filter(status => total >= status.threshold).at(-1) ?? SUPPORT_STATUSES[0];
}
async function readSupportTotal(db: Database, telegramUserId: string): Promise<number> {
  const row = await db.prepare(
    "SELECT COALESCE(SUM(MAX(0, d.amount - COALESCE(r.amount, 0))), 0) AS total " +
    "FROM yume_stars_donations d LEFT JOIN yume_stars_refunds r " +
    "ON r.telegram_payment_charge_id = d.telegram_payment_charge_id " +
    "WHERE d.telegram_user_id = ? AND d.currency = 'XTR' AND d.status = 'paid'",
  ).bind(telegramUserId).first<{ total: number }>();
  return Math.max(0, Math.floor(Number(row?.total ?? 0)));
}
async function readPlusState(db: Database, userId: string) {
  const row = await db.prepare(
    "SELECT id, price_stars, period_start_epoch, period_end_epoch, auto_renew, status, first_charge_id " +
    "FROM yume_plus_subscriptions WHERE user_id = ? AND status = 'active' " +
    "ORDER BY period_end_epoch DESC LIMIT 1",
  ).bind(userId).first<{
    id: string; price_stars: number; period_start_epoch: number; period_end_epoch: number;
    auto_renew: number; status: string; first_charge_id: string;
  }>();
  if (!row) return null;
  if (row.period_end_epoch <= Math.floor(Date.now() / 1000)) {
    await db.prepare("UPDATE yume_plus_subscriptions SET status = 'expired', auto_renew = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'")
      .bind(row.id).run();
    return null;
  }
  return {
    active: true,
    expiresAt: row.period_end_epoch,
    startedAt: row.period_start_epoch,
    autoRenew: row.auto_renew === 1,
    priceStars: row.price_stars,
    subscriptionId: row.id,
    cancellationChargeId: row.first_charge_id,
  };
}
async function readPrice(db: Database): Promise<number | null> {
  const row = await db.prepare("SELECT setting_value FROM yume_plus_settings WHERE setting_key = 'price_stars'")
    .first<{ setting_value: string }>();
  if (!row) return null;
  const value = Number(row.setting_value);
  return Number.isSafeInteger(value) && value >= 1 && value <= 10000 ? value : null;
}
async function readXp(db: Database, userId: string): Promise<number> {
  const row = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM yume_xp_ledger WHERE user_id = ?")
    .bind(userId).first<{ total: number }>();
  return Math.max(0, Math.floor(Number(row?.total ?? 0)));
}
async function ensureUserProfile(db: Database, userId: string): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO yume_user_profiles (user_id) VALUES (?)").bind(userId).run();
}
async function getStats(db: Database, userId: string) {
  const [favorites, watchlist, history] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS total FROM yume_saved_anime WHERE user_id = ? AND list_type = 'favorite'").bind(userId).first<{ total: number }>(),
    db.prepare("SELECT COUNT(*) AS total FROM yume_saved_anime WHERE user_id = ? AND list_type = 'watchlist'").bind(userId).first<{ total: number }>(),
    db.prepare("SELECT COUNT(*) AS total FROM yume_view_history WHERE user_id = ?").bind(userId).first<{ total: number }>(),
  ]);
  return { favorites: Number(favorites?.total ?? 0), watchlist: Number(watchlist?.total ?? 0), history: Number(history?.total ?? 0) };
}
async function getCollectionSummaries(db: Database, ownerId: string, publicOnly = false) {
  const result = await db.prepare(
    "SELECT c.id, c.owner_id, c.title, c.description, c.cover_key, c.visibility, c.is_pinned, c.created_at, c.updated_at, " +
    "COUNT(i.anime_id) AS item_count " +
    "FROM yume_user_collections c LEFT JOIN yume_collection_items i ON i.collection_id = c.id " +
    "WHERE c.owner_id = ? " + (publicOnly ? "AND c.visibility = 'public' " : "") +
    "GROUP BY c.id ORDER BY c.is_pinned DESC, c.updated_at DESC",
  ).bind(ownerId).all<{
    id: string; title: string; description: string; cover_key: string | null; visibility: string;
    is_pinned: number; item_count: number; created_at: string; updated_at: string;
  }>();
  return result.results.map(row => ({
    ...row,
    itemCount: Number(row.item_count),
    isPinned: Number(row.is_pinned) === 1,
    coverUrl: row.cover_key && COVER_FILES[row.cover_key] ? "/images/yubera/" + COVER_FILES[row.cover_key] : null,
    cover_key: undefined,
    item_count: undefined,
    is_pinned: undefined,
  }));
}
async function userProfileData(db: Database, userId: string, own: boolean) {
  const profile = await db.prepare("SELECT visibility, bio, selected_frame FROM yume_user_profiles WHERE user_id = ?")
    .bind(userId).first<{ visibility: string; bio: string; selected_frame: string }>();
  const user = await db.prepare(
    "SELECT id, telegram_user_id, telegram_first_name, telegram_last_name, telegram_username, telegram_photo_url " +
    "FROM yume_users WHERE id = ? AND provider = 'telegram'",
  ).bind(userId).first<{
    id: string; telegram_user_id: string; telegram_first_name: string; telegram_last_name: string | null;
    telegram_username: string | null; telegram_photo_url: string | null;
  }>();
  if (!user) return null;
  const xp = own ? await readXp(db, userId) : 0;
  const level = own ? levelForXp(xp) : await readXp(db, userId).then(levelForXp);
  const [supportTotal, plus, followerCount, followingCount] = await Promise.all([
    readSupportTotal(db, user.telegram_user_id),
    readPlusState(db, userId),
    db.prepare("SELECT COUNT(*) AS total FROM yume_user_follows WHERE followed_id = ?").bind(userId).first<{ total: number }>(),
    db.prepare("SELECT COUNT(*) AS total FROM yume_user_follows WHERE follower_id = ?").bind(userId).first<{ total: number }>(),
  ]);
  const supportStatus = supportForStars(supportTotal);
  const selectedFrame = profile?.selected_frame ?? "none";
  const validSelectedFrame = selectedFrame.startsWith("support_")
    ? (supportStatus.level >= Number(selectedFrame.slice(8)) ? selectedFrame : "none")
    : selectedFrame.startsWith("plus_") && plus ? selectedFrame : "none";
  const frameUrl = validSelectedFrame.startsWith("support_")
    ? "/images/yubera/" + SUPPORT_FRAMES[Number(validSelectedFrame.slice(8))]
    : validSelectedFrame.startsWith("plus_")
      ? "/images/yubera/" + PLUS_FRAMES[Number(validSelectedFrame.slice(5))]
      : null;
  const publicXp = { level: level.level, name: level.name, art: level.art };
  const supportPublic = { level: supportStatus.level, name: supportStatus.name, art: supportStatus.art };
  return {
    id: user.id,
    firstName: user.telegram_first_name,
    lastName: user.telegram_last_name,
    username: user.telegram_username,
    photoUrl: user.telegram_photo_url,
    bio: profile?.bio ?? "",
    visibility: profile?.visibility ?? "private",
    selectedFrame: validSelectedFrame,
    frameUrl,
    level: publicXp,
    supportStatus: supportPublic,
    plusActive: Boolean(plus),
    ...(own ? {
      xp,
      xpToNext: level.max === null ? 0 : Math.max(0, level.max + 1 - xp),
      xpProgress: level.max === null ? 100 : Math.min(100, Math.round(((xp - level.min) / (level.max + 1 - level.min)) * 100)),
      nextLevel: LEVELS.find(item => item.level === level.level + 1) ?? null,
      supportTotalStars: supportTotal,
      supportProgressToNext: supportStatus.level === 5 ? null : {
        current: supportTotal - supportStatus.threshold,
        required: (SUPPORT_STATUSES[supportStatus.level + 1]?.threshold ?? supportTotal) - supportStatus.threshold,
      },
      plus,
      stats: await getStats(db, userId),
      collections: await getCollectionSummaries(db, userId),
      followerCount: Number(followerCount?.total ?? 0),
      followingCount: Number(followingCount?.total ?? 0),
      unlockedFrames: [
        ...Object.keys(SUPPORT_FRAMES).filter(key => supportStatus.level >= Number(key)).map(key => "support_" + key),
        ...(plus ? Object.keys(PLUS_FRAMES).map(key => "plus_" + key) : []),
      ],
    } : {
      followerCount: Number(followerCount?.total ?? 0),
      followingCount: Number(followingCount?.total ?? 0),
    }),
  };
}
async function currentPriceOrError(db: Database): Promise<number> {
  const price = await readPrice(db);
  if (price === null) throw new Error("plus_price_not_configured");
  return price;
}
async function createInvoiceLink(token: string, payload: Record<string, unknown>) {
  const response = await fetch("https://api.telegram.org/bot" + token + "/createInvoiceLink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(7000),
    body: JSON.stringify(payload),
  });
  const result = await response.json() as { ok?: boolean; result?: string };
  if (!response.ok || result.ok !== true || typeof result.result !== "string" || !result.result.startsWith("https://t.me/")) {
    throw new Error("telegram_invoice_creation_failed");
  }
  return result.result;
}

export async function handleYuberaCommunity(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (request.method === "POST" && !sameOriginOrBearer(request)) return json({ error: "cross_origin_request" }, 403);
  const env = environment();
  const db = env.YUME_DB && typeof env.YUME_DB === "object" ? env.YUME_DB : null;
  if (!db) return json({ error: "database_unavailable" }, 503);

  try {
    const user = await authenticate(request, db, env);
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "me";

    if (request.method === "GET") {
      if (action === "search" || action === "recommendations") {
        if (!user) return json({ error: "authentication_required" }, 401);
        if (action === "recommendations") {
          const rows = await db.prepare(
            "SELECT u.id, u.telegram_first_name, u.telegram_last_name, u.telegram_username, u.telegram_photo_url, p.bio " +
            "FROM yume_users u JOIN yume_user_profiles p ON p.user_id = u.id " +
            "WHERE u.id <> ? AND p.visibility = 'public' " +
            "AND NOT EXISTS (SELECT 1 FROM yume_user_follows f WHERE f.follower_id = ? AND f.followed_id = u.id) " +
            "ORDER BY RANDOM() LIMIT 8",
          ).bind(user.user_id, user.user_id).all<Record<string, unknown>>();
          return json({ users: rows.results });
        }
        const query = (url.searchParams.get("q") ?? "").trim().slice(0, 64);
        if (query.length < 2) return json({ users: [] });
        const pattern = "%" + query.replace(/[%_\\]/g, "\\$&") + "%";
        const rows = await db.prepare(
          "SELECT u.id, u.telegram_first_name, u.telegram_last_name, u.telegram_username, u.telegram_photo_url, p.bio " +
          "FROM yume_users u JOIN yume_user_profiles p ON p.user_id = u.id " +
          "WHERE u.id <> ? AND p.visibility = 'public' AND (" +
          "LOWER(u.telegram_first_name) LIKE LOWER(?) ESCAPE '\\' OR " +
          "LOWER(COALESCE(u.telegram_last_name,'')) LIKE LOWER(?) ESCAPE '\\' OR " +
          "LOWER(COALESCE(u.telegram_username,'')) LIKE LOWER(?) ESCAPE '\\') " +
          "ORDER BY u.telegram_first_name COLLATE NOCASE LIMIT 30",
        ).bind(user.user_id, pattern, pattern, pattern).all<Record<string, unknown>>();
        return json({ users: rows.results });
      }

      if (action === "public") {
        const idOrUsername = (url.searchParams.get("id") ?? url.searchParams.get("username") ?? "").trim().replace(/^@/, "");
        if (!idOrUsername) return json({ error: "profile_not_found" }, 404);
        const target = await db.prepare(
          "SELECT id FROM yume_users WHERE id = ? OR LOWER(telegram_username) = LOWER(?) LIMIT 1",
        ).bind(idOrUsername, idOrUsername).first<{ id: string }>();
        if (!target) return json({ error: "profile_not_found" }, 404);
        const own = user?.user_id === target.id;
        await ensureUserProfile(db, target.id);
        const rawProfile = await db.prepare("SELECT visibility FROM yume_user_profiles WHERE user_id = ?").bind(target.id).first<{ visibility: string }>();
        if (!own && rawProfile?.visibility !== "public") return json({ error: "profile_not_found" }, 404);
        const profile = await userProfileData(db, target.id, own);
        if (!profile) return json({ error: "profile_not_found" }, 404);
        const following = user ? Boolean(await db.prepare("SELECT 1 AS found FROM yume_user_follows WHERE follower_id = ? AND followed_id = ?")
          .bind(user.user_id, target.id).first<{ found: number }>()) : false;
        return json({
          profile: {
            ...profile,
            ...(own ? {} : {
              xp: undefined, xpToNext: undefined, xpProgress: undefined, nextLevel: undefined,
              supportTotalStars: undefined, supportProgressToNext: undefined, plus: undefined,
              stats: undefined, collections: undefined, unlockedFrames: undefined,
            }),
            ...(own ? {} : { collections: await getCollectionSummaries(db, target.id, true) }),
          },
          own,
          following,
        });
      }

      if (action === "following" || action === "followers") {
        if (!user) return json({ error: "authentication_required" }, 401);
        const limit = Math.min(50, Math.max(1, numberParam(url.searchParams.get("limit"), 20)));
        const offset = Math.min(10000, numberParam(url.searchParams.get("offset"), 0));
        const sql = action === "following"
          ? "SELECT u.id, u.telegram_first_name, u.telegram_last_name, u.telegram_username, u.telegram_photo_url, p.bio, f.created_at " +
            "FROM yume_user_follows f JOIN yume_users u ON u.id = f.followed_id JOIN yume_user_profiles p ON p.user_id = u.id " +
            "WHERE f.follower_id = ? AND p.visibility = 'public' ORDER BY f.created_at DESC LIMIT ? OFFSET ?"
          : "SELECT u.id, u.telegram_first_name, u.telegram_last_name, u.telegram_username, u.telegram_photo_url, p.bio, f.created_at " +
            "FROM yume_user_follows f JOIN yume_users u ON u.id = f.follower_id JOIN yume_user_profiles p ON p.user_id = u.id " +
            "WHERE f.followed_id = ? AND p.visibility = 'public' ORDER BY f.created_at DESC LIMIT ? OFFSET ?";
        const rows = await db.prepare(sql).bind(user.user_id, limit, offset).all<Record<string, unknown>>();
        return json({ users: rows.results, limit, offset, hasMore: rows.results.length === limit });
      }

      if (action === "collection") {
        const collectionId = url.searchParams.get("id") ?? "";
        const collection = await db.prepare("SELECT id, owner_id, title, description, cover_key, visibility, is_pinned FROM yume_user_collections WHERE id = ?")
          .bind(collectionId).first<{ id: string; owner_id: string; title: string; description: string; cover_key: string | null; visibility: string; is_pinned: number }>();
        if (!collection) return json({ error: "collection_not_found" }, 404);
        const own = user?.user_id === collection.owner_id;
        if (!own) {
          const profile = await db.prepare("SELECT visibility FROM yume_user_profiles WHERE user_id = ?")
            .bind(collection.owner_id).first<{ visibility: string }>();
          if (profile?.visibility !== "public" || collection.visibility !== "public") return json({ error: "collection_not_found" }, 404);
        }
        const [items, likes, liked] = await Promise.all([
          db.prepare("SELECT anime_id, added_at FROM yume_collection_items WHERE collection_id = ? ORDER BY added_at DESC")
            .bind(collectionId).all<{ anime_id: string; added_at: string }>(),
          db.prepare("SELECT COUNT(*) AS total FROM yume_collection_likes WHERE collection_id = ?")
            .bind(collectionId).first<{total:number}>(),
          user ? db.prepare("SELECT 1 AS found FROM yume_collection_likes WHERE collection_id = ? AND user_id = ?")
            .bind(collectionId,user.user_id).first<{found:number}>() : Promise.resolve(null),
        ]);
        const catalog = await Promise.all(items.results.map(async item => {
          try { return { anime: await getR2Anime(item.anime_id), addedAt: item.added_at }; } catch { return { anime: null, addedAt: item.added_at }; }
        }));
        const owner = await db.prepare("SELECT id, telegram_first_name, telegram_last_name, telegram_username, telegram_photo_url FROM yume_users WHERE id = ?")
          .bind(collection.owner_id).first<Record<string, unknown>>();
        return json({
          collection: {
            ...collection,
            isPinned: Number(collection.is_pinned) === 1,
            coverUrl: collection.cover_key ? "/images/yubera/" + COVER_FILES[collection.cover_key] : null,
          },
          owner,
          items: catalog.filter(item => item.anime).map(item => ({ ...item.anime, addedAt: item.addedAt })),
          likeCount: Number(likes?.total ?? 0),
          liked: Boolean(liked),
          own,
        });
      }

      if (!user) return json({ error: "authentication_required" }, 401);
      if (action === "collections") {
        await ensureUserProfile(db, user.user_id);
        return json({ collections: await getCollectionSummaries(db, user.user_id) });
      }
      if (action !== "me") return json({ error: "unknown_action" }, 400);
      await ensureUserProfile(db, user.user_id);
      const profile = await userProfileData(db, user.user_id, true);
      return json({ authenticated: true, profile, levelCatalog: LEVELS, supportCatalog: SUPPORT_STATUSES, collectionCovers: COVER_KEYS });
    }

    const body = await readBody(request);
    if (!body) return json({ error: "invalid_request" }, 400);
    if (!user) return json({ error: "authentication_required" }, 401);
    const op = body.action;

    if (op === "profile.update") {
      const bio = typeof body.bio === "string" ? body.bio.trim() : "";
      const visibility = body.visibility;
      const frame = typeof body.selectedFrame === "string" ? body.selectedFrame : "none";
      if (bio.length > 250 || (visibility !== "public" && visibility !== "private")) return json({ error: "invalid_profile" }, 400);
      const supportTotal = await readSupportTotal(db, user.telegram_user_id);
      const status = supportForStars(supportTotal);
      const plus = await readPlusState(db, user.user_id);
      let frameOk = frame === "none";
      if (/^support_[1-5]$/.test(frame)) frameOk = status.level >= Number(frame.slice(8));
      if (/^plus_[1-5]$/.test(frame)) frameOk = Boolean(plus);
      if (!frameOk) return json({ error: "frame_not_unlocked" }, 403);
      await db.prepare("INSERT INTO yume_user_profiles (user_id, visibility, bio, selected_frame, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) " +
        "ON CONFLICT(user_id) DO UPDATE SET visibility = excluded.visibility, bio = excluded.bio, selected_frame = excluded.selected_frame, updated_at = CURRENT_TIMESTAMP")
        .bind(user.user_id, visibility, bio, frame).run();
      return json({ saved: true });
    }

    if (op === "follow" || op === "unfollow") {
      const targetId = typeof body.userId === "string" ? body.userId : "";
      if (!targetId || targetId === user.user_id) return json({ error: "invalid_follow_target" }, 400);
      const target = await db.prepare(
        "SELECT p.visibility FROM yume_users u JOIN yume_user_profiles p ON p.user_id = u.id WHERE u.id = ?",
      ).bind(targetId).first<{ visibility: string }>();
      if (!target || target.visibility !== "public") return json({ error: "profile_not_followable" }, 404);
      if (op === "follow") await db.prepare("INSERT OR IGNORE INTO yume_user_follows (follower_id, followed_id) VALUES (?, ?)")
        .bind(user.user_id, targetId).run();
      else await db.prepare("DELETE FROM yume_user_follows WHERE follower_id = ? AND followed_id = ?")
        .bind(user.user_id, targetId).run();
      return json({ following: op === "follow" });
    }

    if (op === "collection.like" || op === "collection.unlike") {
      const collectionId = typeof body.collectionId === "string" ? body.collectionId : "";
      const collection = await db.prepare("SELECT id, owner_id, visibility FROM yume_user_collections WHERE id = ?")
        .bind(collectionId).first<{id:string;owner_id:string;visibility:string}>();
      if (!collection) return json({error:"collection_not_found"},404);
      if (collection.owner_id !== user.user_id) {
        const owner = await db.prepare("SELECT visibility FROM yume_user_profiles WHERE user_id = ?").bind(collection.owner_id).first<{visibility:string}>();
        if (collection.visibility !== "public" || owner?.visibility !== "public") return json({error:"collection_not_found"},404);
      }
      if (op === "collection.like") await db.prepare("INSERT OR IGNORE INTO yume_collection_likes(collection_id,user_id) VALUES(?,?)").bind(collectionId,user.user_id).run();
      else await db.prepare("DELETE FROM yume_collection_likes WHERE collection_id = ? AND user_id = ?").bind(collectionId,user.user_id).run();
      const row = await db.prepare("SELECT COUNT(*) AS total FROM yume_collection_likes WHERE collection_id = ?").bind(collectionId).first<{total:number}>();
      return json({liked:op === "collection.like",likeCount:Number(row?.total ?? 0)});
    }

    if (op === "collection.create") {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const coverKey = body.coverKey === null || body.coverKey === undefined ? null : String(body.coverKey);
      const visibility = body.visibility;
      if (!title || title.length > 50 || description.length > 250 ||
          (coverKey !== null && !COVER_KEYS.includes(coverKey as typeof COVER_KEYS[number])) ||
          (visibility !== "public" && visibility !== "private")) return json({ error: "invalid_collection" }, 400);
      const plus = await readPlusState(db, user.user_id);
      const limit = plus ? 30 : 5;
      const total = await db.prepare("SELECT COUNT(*) AS total FROM yume_user_collections WHERE owner_id = ?")
        .bind(user.user_id).first<{ total: number }>();
      if (Number(total?.total ?? 0) >= limit) return json({ error: "collection_limit_reached", limit }, 409);
      const collectionId = crypto.randomUUID();
      await db.prepare("INSERT INTO yume_user_collections (id, owner_id, title, description, cover_key, visibility) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(collectionId, user.user_id, title, description, coverKey, visibility).run();
      return json({ created: true, collectionId });
    }

    if (op === "collection.update") {
      const idValue = typeof body.collectionId === "string" ? body.collectionId : "";
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const coverKey = body.coverKey === null || body.coverKey === undefined ? null : String(body.coverKey);
      const visibility = body.visibility;
      if (!title || title.length > 50 || description.length > 250 ||
          (coverKey !== null && !COVER_KEYS.includes(coverKey as typeof COVER_KEYS[number])) ||
          (visibility !== "public" && visibility !== "private")) return json({ error: "invalid_collection" }, 400);
      const result = await db.prepare("UPDATE yume_user_collections SET title = ?, description = ?, cover_key = ?, visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
        .bind(title, description, coverKey, visibility, idValue, user.user_id).run();
      return Number(result.meta?.changes ?? 0) === 1 ? json({ saved: true }) : json({ error: "collection_not_found" }, 404);
    }

    if (op === "collection.pin") {
      const collectionId = typeof body.collectionId === "string" ? body.collectionId : "";
      const pinned = body.pinned === true;
      const result = await db.prepare("UPDATE yume_user_collections SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
        .bind(pinned ? 1 : 0, collectionId, user.user_id).run();
      return Number(result.meta?.changes ?? 0) === 1 ? json({ saved: true, pinned }) : json({ error: "collection_not_found" }, 404);
    }

    if (op === "collection.delete") {
      const collectionId = typeof body.collectionId === "string" ? body.collectionId : "";
      const result = await db.prepare("DELETE FROM yume_user_collections WHERE id = ? AND owner_id = ?")
        .bind(collectionId, user.user_id).run();
      return Number(result.meta?.changes ?? 0) === 1 ? json({ deleted: true }) : json({ error: "collection_not_found" }, 404);
    }

    if (op === "collection.addAnime") {
      const collectionId = typeof body.collectionId === "string" ? body.collectionId : "";
      const animeId = typeof body.animeId === "string" ? body.animeId : "";
      if (!/^\d{1,12}$/.test(animeId)) return json({ error: "invalid_anime_id" }, 400);
      const collection = await db.prepare("SELECT id FROM yume_user_collections WHERE id = ? AND owner_id = ?")
        .bind(collectionId, user.user_id).first<{ id: string }>();
      if (!collection) return json({ error: "collection_not_found" }, 404);
      try {
        const anime = await getR2Anime(animeId);
        if (!anime) return json({ error: "anime_not_found" }, 404);
      } catch {
        return json({ error: "catalog_unavailable" }, 503);
      }
      const plus = await readPlusState(db, user.user_id);
      const limit = plus ? 300 : 50;
      const result = await db.prepare(
        "INSERT OR IGNORE INTO yume_collection_items (collection_id, anime_id) " +
        "SELECT ?, ? WHERE EXISTS (SELECT 1 FROM yume_collection_items WHERE collection_id = ? AND anime_id = ?) " +
        "OR (SELECT COUNT(*) FROM yume_collection_items WHERE collection_id = ?) < ?",
      ).bind(collectionId, animeId, collectionId, animeId, collectionId, limit).run();
      if (Number(result.meta?.changes ?? 0) === 0) {
        const exists = await db.prepare("SELECT 1 AS found FROM yume_collection_items WHERE collection_id = ? AND anime_id = ?")
          .bind(collectionId, animeId).first<{ found: number }>();
        if (!exists) return json({ error: "collection_item_limit_reached", limit }, 409);
      } else {
        await db.prepare("INSERT OR IGNORE INTO yume_xp_ledger (id, user_id, event_key, event_type, amount, metadata_json) VALUES (?, ?, ?, 'collection_item_added', 2, ?)")
          .bind(crypto.randomUUID(), user.user_id, "collection_item_added:" + collectionId + ":" + animeId,
            JSON.stringify({ collectionId, animeId })).run();
      }
      const count = await db.prepare("SELECT COUNT(*) AS total FROM yume_collection_items WHERE collection_id = ?")
        .bind(collectionId).first<{ total: number }>();
      if (Number(count?.total ?? 0) >= 3) {
        await db.prepare("INSERT OR IGNORE INTO yume_xp_ledger (id, user_id, event_key, event_type, amount, metadata_json) VALUES (?, ?, ?, 'collection_three_titles', 15, ?)")
          .bind(crypto.randomUUID(), user.user_id, "collection_three_titles:" + collectionId,
            JSON.stringify({ collectionId })).run();
      }
      await db.prepare("UPDATE yume_user_collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(collectionId).run();
      return json({ saved: true, count: Number(count?.total ?? 0) });
    }

    if (op === "collection.removeAnime") {
      const collectionId = typeof body.collectionId === "string" ? body.collectionId : "";
      const animeId = typeof body.animeId === "string" ? body.animeId : "";
      const result = await db.prepare(
        "DELETE FROM yume_collection_items WHERE collection_id = ? AND anime_id = ? AND EXISTS " +
        "(SELECT 1 FROM yume_user_collections WHERE id = ? AND owner_id = ?)",
      ).bind(collectionId, animeId, collectionId, user.user_id).run();
      if (Number(result.meta?.changes ?? 0) !== 1) return json({ error: "collection_item_not_found" }, 404);
      await db.prepare("UPDATE yume_user_collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(collectionId).run();
      return json({ removed: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown_error";
    if (code === "plus_price_not_configured") return json({ error: code }, 409);
    console.error("[YUBERA][COMMUNITY] Request failed:", { code });
    return json({ error: "community_unavailable" }, 503);
  }
}

export async function handleYuberaPlus(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (request.method === "POST" && !sameOriginOrBearer(request)) return json({ error: "cross_origin_request" }, 403);
  const env = environment();
  const db = env.YUME_DB && typeof env.YUME_DB === "object" ? env.YUME_DB : null;
  if (!db) return json({ error: "database_unavailable" }, 503);
  const user = await authenticate(request, db, env);
  if (!user) return json({ error: "authentication_required" }, 401);
  try {
    if (request.method === "GET") {
      const [price, subscription] = await Promise.all([readPrice(db), readPlusState(db, user.user_id)]);
      return json({
        priceStars: price,
        priceConfigured: price !== null,
        periodDays: 30,
        periodSeconds: PLUS_PERIOD_SECONDS,
        subscription: subscription ? {
          active: true,
          expiresAt: subscription.expiresAt,
          startedAt: subscription.startedAt,
          autoRenew: subscription.autoRenew,
          priceStars: subscription.priceStars,
        } : null,
        benefits: [
          { title: "AI-помощник", description: "Рекомендации, создание подборок и помощь в поиске аниме", state: "soon" },
          { title: "Расширенные подборки", description: "Больше лимитов и гибкие настройки", state: "active" },
          { title: "Эксклюзивные рамки аватара", description: "Особое оформление профиля", state: "active" },
          { title: "Эксклюзивный статус YUBERA Plus", description: "Отдельная отметка подписки в профиле", state: "active" },
        ],
      });
    }

    const body = await readBody(request, 4096);
    if (!body) return json({ error: "invalid_request" }, 400);
    if (body.action === "setPrice") {
      if (!await isAdmin(request, db, env, user)) return json({ error: "admin_required" }, 403);
      const price = body.priceStars;
      if (typeof price !== "number" || !Number.isSafeInteger(price) || price < 1 || price > 10000) {
        return json({ error: "invalid_price", min: 1, max: 10000 }, 400);
      }
      const oldPrice = await readPrice(db);
      await db.prepare("INSERT INTO yume_plus_settings (setting_key, setting_value, updated_by, updated_at) VALUES ('price_stars', ?, ?, CURRENT_TIMESTAMP) " +
        "ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP")
        .bind(String(price), user.user_id).run();
      await db.prepare("INSERT INTO yume_plus_price_audit (id, old_price, new_price, admin_user_id) VALUES (?, ?, ?, ?)")
        .bind(crypto.randomUUID(), oldPrice, price, user.user_id).run();
      return json({ saved: true, oldPriceStars: oldPrice, priceStars: price });
    }

    if (body.action === "createInvoice") {
      const autoRenew = body.autoRenew === true;
      const current = await readPlusState(db, user.user_id);
      if (current) return json({ error: "subscription_already_active", expiresAt: current.expiresAt }, 409);
      const price = await currentPriceOrError(db);
      const token = typeof env.TELEGRAM_BOT_TOKEN === "string" ? env.TELEGRAM_BOT_TOKEN.trim() : "";
      if (!token) return json({ error: "payments_not_configured" }, 503);
      const id = crypto.randomUUID();
      const payload = "yubera_plus:" + id;
      await db.prepare("INSERT INTO yume_plus_orders (id, payload, user_id, telegram_user_id, amount, auto_renew, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')")
        .bind(id, payload, user.user_id, user.telegram_user_id, price, autoRenew ? 1 : 0).run();
      const invoiceUrl = await createInvoiceLink(token, {
        title: "YUBERA Plus — 30 дней",
        description: autoRenew
          ? "Подписка YUBERA Plus на 30 дней с автоматическим продлением по согласию пользователя."
          : "Подписка YUBERA Plus на 30 дней без автоматического продления.",
        payload,
        provider_token: "",
        currency: "XTR",
        prices: [{ label: "YUBERA Plus — 30 дней", amount: price }],
        ...(autoRenew ? { subscription_period: PLUS_PERIOD_SECONDS } : {}),
      });
      await db.prepare("UPDATE yume_plus_orders SET invoice_link = ? WHERE payload = ? AND status = 'pending'")
        .bind(invoiceUrl, payload).run();
      return json({ invoiceUrl, payload, priceStars: price, autoRenew, periodSeconds: PLUS_PERIOD_SECONDS });
    }

    if (body.action === "cancelRenewal" || body.action === "resumeRenewal") {
      const subscription = await readPlusState(db, user.user_id);
      if (!subscription) return json({ error: "subscription_not_active" }, 409);
      if (body.action === "resumeRenewal" && !subscription.autoRenew) {
        return json({ error: "renewal_requires_new_telegram_consent" }, 409);
      }
      const token = typeof env.TELEGRAM_BOT_TOKEN === "string" ? env.TELEGRAM_BOT_TOKEN.trim() : "";
      if (!token) return json({ error: "payments_not_configured" }, 503);
      const response = await fetch("https://api.telegram.org/bot" + token + "/editUserStarSubscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(7000),
        body: JSON.stringify({
          user_id: Number(user.telegram_user_id),
          telegram_payment_charge_id: subscription.cancellationChargeId,
          is_canceled: body.action !== "resumeRenewal",
        }),
      });
      const result = await response.json() as { ok?: boolean };
      if (!response.ok || result.ok !== true) return json({ error: "telegram_subscription_update_failed" }, 502);
      const autoRenew = body.action === "resumeRenewal";
      await db.prepare("UPDATE yume_plus_subscriptions SET auto_renew = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(autoRenew ? 1 : 0, subscription.subscriptionId).run();
      return json({ saved: true, autoRenew, expiresAt: subscription.expiresAt });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown_error";
    if (code === "plus_price_not_configured") return json({ error: code }, 409);
    console.error("[YUBERA][PLUS] Request failed:", { code });
    return json({ error: "plus_unavailable" }, 503);
  }
}

export async function recordYuberaPlusPreCheckout(
  db: Database,
  telegramUserId: number,
  amount: number,
  payload: string,
): Promise<"approved" | "rejected"> {
  const order = await db.prepare(
    "SELECT telegram_user_id, amount, status FROM yume_plus_orders WHERE payload = ?",
  ).bind(payload).first<{ telegram_user_id: string; amount: number; status: string }>();
  if (!order || order.telegram_user_id !== String(telegramUserId) || order.amount !== amount ||
      !["pending", "pre_checkout"].includes(order.status)) return "rejected";
  if (order.status === "pending") {
    const update = await db.prepare("UPDATE yume_plus_orders SET status = 'pre_checkout' WHERE payload = ? AND status = 'pending'")
      .bind(payload).run();
    if (Number(update.meta?.changes ?? 0) !== 1) return "rejected";
  }
  return "approved";
}

export async function recordYuberaPlusSuccessfulPayment(
  db: Database,
  input: {
    telegramUserId: number; amount: number; payload: string; chargeId: string;
    isRecurring: boolean; expirationDate?: number; periodSeconds?: number;
  },
): Promise<"recorded" | "duplicate" | "ignored"> {
  const order = await db.prepare(
    "SELECT id, user_id, telegram_user_id, amount, auto_renew, status FROM yume_plus_orders WHERE payload = ?",
  ).bind(input.payload).first<{
    id: string; user_id: string; telegram_user_id: string; amount: number; auto_renew: number; status: string;
  }>();
  if (!order || order.telegram_user_id !== String(input.telegramUserId) ||
      order.amount !== input.amount || order.status !== "pre_checkout") return "ignored";
  const duplicate = await db.prepare("SELECT 1 AS found FROM yume_plus_payments WHERE telegram_payment_charge_id = ?")
    .bind(input.chargeId).first<{ found: number }>();
  if (duplicate) return "duplicate";
  const now = Math.floor(Date.now() / 1000);
  const end = input.expirationDate && input.expirationDate > now
    ? input.expirationDate
    : now + PLUS_PERIOD_SECONDS;
  const existing = await db.prepare(
    "SELECT id, period_end_epoch FROM yume_plus_subscriptions WHERE invoice_payload = ? ORDER BY period_end_epoch DESC LIMIT 1",
  ).bind(input.payload).first<{ id: string; period_end_epoch: number }>();
  let subscriptionId = existing?.id ?? crypto.randomUUID();
  const start = existing ? Number(existing.period_end_epoch) : now;
  if (!existing) {
    await db.prepare(
      "INSERT INTO yume_plus_subscriptions (id, user_id, telegram_user_id, invoice_payload, first_charge_id, price_stars, period_start_epoch, period_end_epoch, auto_renew, status) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')",
    ).bind(subscriptionId, order.user_id, order.telegram_user_id, input.payload, input.chargeId,
      input.amount, now, end, input.isRecurring && order.auto_renew === 1 ? 1 : 0).run();
  } else {
    await db.prepare("UPDATE yume_plus_subscriptions SET period_end_epoch = MAX(period_end_epoch, ?), auto_renew = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(end, input.isRecurring ? 1 : 0, subscriptionId).run();
  }
  await db.prepare(
    "INSERT INTO yume_plus_payments (telegram_payment_charge_id, subscription_id, user_id, invoice_payload, amount, is_recurring, period_end_epoch) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(input.chargeId, subscriptionId, order.user_id, input.payload, input.amount, input.isRecurring ? 1 : 0, end).run();
  await db.prepare("UPDATE yume_plus_orders SET status = 'paid' WHERE payload = ? AND status = 'pre_checkout'")
    .bind(input.payload).run();
  return "recorded";
}

export async function recordYuberaStarRefund(
  db: Database,
  input: { chargeId: string; telegramUserId: string; amount: number },
): Promise<boolean> {
  const donation = await db.prepare("SELECT id, amount FROM yume_stars_donations WHERE telegram_payment_charge_id = ? AND telegram_user_id = ?")
    .bind(input.chargeId, input.telegramUserId).first<{ id: string; amount: number }>();
  if (!donation) return false;
  const refund = Math.min(Math.max(1, Math.floor(input.amount)), Number(donation.amount));
  await db.prepare("INSERT OR IGNORE INTO yume_stars_refunds (telegram_payment_charge_id, telegram_user_id, amount, currency) VALUES (?, ?, ?, 'XTR')")
    .bind(input.chargeId, input.telegramUserId, refund).run();
  return true;
}
