import { env as cloudflareEnv } from "cloudflare:workers";
import { getAuthenticatedYumeUserId } from "@/data/telegram-auth.server";
import { getR2Anime } from "@/data/catalog-r2.server";

type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
type Database = { prepare(sql: string): Statement; batch?: (statements: Statement[]) => Promise<Array<{ meta?: { changes?: number } }>> };
type Environment = { YUME_DB?: unknown };
type RuntimeGlobal = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };
type UserRow = {
  id: string; telegram_user_id: string; telegram_first_name: string; telegram_last_name: string | null;
  telegram_username: string | null; telegram_photo_url: string | null;
};
type ProfileRow = { bio: string; visibility: "public" | "private"; avatar_frame: string | null };
type XPLevel = { level: number; title: string; min: number; max: number | null };
const XP_LEVELS: XPLevel[] = [
  { level: 1, title: "Начинающий зритель", min: 0, max: 49 },
  { level: 2, title: "Любитель аниме", min: 50, max: 149 },
  { level: 3, title: "Искатель историй", min: 150, max: 299 },
  { level: 4, title: "Исследователь миров", min: 300, max: 499 },
  { level: 5, title: "Коллекционер", min: 500, max: 749 },
  { level: 6, title: "Знаток аниме", min: 750, max: 999 },
  { level: 7, title: "Хранитель историй", min: 1000, max: 1499 },
  { level: 8, title: "Мастер YUBERA", min: 1500, max: 2199 },
  { level: 9, title: "Архивариус YUBERA", min: 2200, max: 3199 },
  { level: 10, title: "Легенда YUBERA", min: 3200, max: null },
];
const SUPPORT_LEVELS = [
  { level: 0, title: "Без статуса", min: 0, asset: null },
  { level: 1, title: "Союзник", min: 50, asset: "YUBERA_Support_Status_Level_01_Soyuznik.webp" },
  { level: 2, title: "Сторонник", min: 1000, asset: "YUBERA_Support_Status_Level_02_Storonnik.webp" },
  { level: 3, title: "Преданный участник", min: 2500, asset: "YUBERA_Support_Status_Level_03_Predanniy_Uchastnik.webp" },
  { level: 4, title: "Почётный покровитель", min: 5000, asset: "YUBERA_Support_Status_Level_04_Pochetnyy_Pokrovitel.webp" },
  { level: 5, title: "Легенда YUBERA", min: 10000, asset: "YUBERA_Support_Status_Level_05_Legenda_YUBERA.webp" },
] as const;
const FREE_COLLECTIONS = 5;
const FREE_TITLES = 50;
const PLUS_COLLECTIONS = 30;
const PLUS_TITLES = 300;

function env(): Environment {
  try {
    const native = cloudflareEnv as unknown as Environment;
    if (native && typeof native === "object") return native;
  } catch { /* unit tests may inject a runtime environment */ }
  const injected = (globalThis as RuntimeGlobal).__YUME_RUNTIME_ENV__;
  return injected && typeof injected === "object" ? injected as Environment : {};
}
function db(): Database | null {
  const value = env().YUME_DB;
  return value && typeof value === "object" ? value as Database : null;
}
function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", Vary: "Cookie" },
  });
}
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
function validId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{1,12}$/.test(value);
}
const SUPPORT_FRAME_ASSETS = [
  "YUBERA_Contribution_Avatar_Frame_01_Soyuznik.webp.webp",
  "YUBERA_Contribution_Avatar_Frame_02_Storonnik.webp.webp",
  "YUBERA_Contribution_Avatar_Frame_03_Predanniy_Uchastnik.webp.webp",
  "YUBERA_Contribution_Avatar_Frame_04_Pochetnyy_Pokrovitel.webp",
  "YUBERA_Contribution_Avatar_Frame_05_Legenda_YUBERA.webp",
] as const;
const PLUS_FRAME_ASSETS = [
  "YUBERA_Plus_Avatar_Frame_01_Sakura_Gold.webp",
  "YUBERA_Plus_Avatar_Frame_02_Mystic_Kitsune.webp",
  "YUBERA_Plus_Avatar_Frame_03_Samurai_Steel.webp",
  "YUBERA_Plus_Avatar_Frame_04_Celestial_Archive.webp",
  "YUBERA_Plus_Avatar_Frame_05_Cyberpunk_Neon.webp",
] as const;
function profileAssetFrame(value: unknown): string | null {
  return typeof value === "string" && [...SUPPORT_FRAME_ASSETS, ...PLUS_FRAME_ASSETS].includes(value) ? value : null;
}
function supportFrameLevel(value: string): number {
  return SUPPORT_FRAME_ASSETS.indexOf(value as typeof SUPPORT_FRAME_ASSETS[number]) + 1;
}
function isSupportFrame(value: string | null): boolean {
  return Boolean(value && supportFrameLevel(value) > 0);
}
async function userAndProfile(database: Database, userId: string) {
  const user = await database.prepare("SELECT id, telegram_user_id, telegram_first_name, telegram_last_name, telegram_username, telegram_photo_url FROM yume_users WHERE id = ?")
    .bind(userId).first<UserRow>();
  if (!user) return null;
  await database.prepare("INSERT OR IGNORE INTO yume_profiles(user_id) VALUES (?)").bind(userId).run();
  const profile = await database.prepare("SELECT bio, visibility, avatar_frame FROM yume_profiles WHERE user_id = ?")
    .bind(userId).first<ProfileRow>();
  return { user, profile: profile ?? { bio: "", visibility: "private" as const, avatar_frame: null } };
}
async function plusActive(database: Database, userId: string): Promise<boolean> {
  const row = await database.prepare("SELECT 1 AS active FROM yume_plus_subscriptions WHERE user_id = ? AND status = 'active' AND expires_at > ? LIMIT 1")
    .bind(userId, Date.now()).first<{ active: number }>();
  return Boolean(row);
}
async function xpTotal(database: Database, userId: string): Promise<number> {
  const row = await database.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM yume_xp_ledger WHERE user_id = ?")
    .bind(userId).first<{ total: number }>();
  return Math.max(0, Number(row?.total ?? 0));
}
function xpState(total: number) {
  const current = [...XP_LEVELS].reverse().find((level) => total >= level.min) ?? XP_LEVELS[0];
  const next = XP_LEVELS.find((level) => level.level === current.level + 1) ?? null;
  return {
    total, level: current.level, title: current.title,
    nextLevel: next?.level ?? null, nextTitle: next?.title ?? null,
    nextThreshold: next?.min ?? null,
    progress: next ? Math.max(0, Math.min(100, ((total - current.min) / (next.min - current.min)) * 100)) : 100,
    remaining: next ? Math.max(0, next.min - total) : 0,
  };
}
async function supportState(database: Database, telegramUserId: string) {
  const row = await database.prepare(`SELECT COALESCE(SUM(d.amount), 0) AS total
    FROM yume_stars_donations d
    LEFT JOIN yume_stars_refunds r ON r.telegram_payment_charge_id = d.telegram_payment_charge_id
    WHERE d.telegram_user_id = ? AND d.status = 'paid' AND r.telegram_payment_charge_id IS NULL`)
    .bind(telegramUserId).first<{ total: number }>();
  const total = Math.max(0, Number(row?.total ?? 0));
  const current = [...SUPPORT_LEVELS].reverse().find((level) => total >= level.min) ?? SUPPORT_LEVELS[0];
  const next = SUPPORT_LEVELS.find((level) => level.level === current.level + 1) ?? null;
  return { total, level: current.level, title: current.title, asset: current.asset,
    nextLevel: next?.level ?? null, nextTitle: next?.title ?? null, nextThreshold: next?.min ?? null,
    progress: next ? Math.max(0, Math.min(100, ((total - current.min) / (next.min - current.min)) * 100)) : 100,
    remaining: next ? Math.max(0, next.min - total) : 0 };
}
async function profileSummary(database: Database, userId: string, viewerId: string | null) {
  const account = await userAndProfile(database, userId);
  if (!account) return null;
  const isOwner = viewerId === userId;
  if (!isOwner && account.profile.visibility !== "public") return { private: true };
  const [xp, support, plus, followers, following, collections, unlockedSupportFrames] = await Promise.all([
    xpTotal(database, userId).then(xpState),
    supportState(database, account.user.telegram_user_id),
    plusActive(database, userId),
    database.prepare("SELECT COUNT(*) AS count FROM yume_follows WHERE followed_id = ?").bind(userId).first<{ count: number }>(),
    database.prepare("SELECT COUNT(*) AS count FROM yume_follows WHERE follower_id = ?").bind(userId).first<{ count: number }>(),
    database.prepare("SELECT COUNT(*) AS count, COALESCE(SUM((SELECT COUNT(*) FROM yume_collection_items i WHERE i.collection_id = c.id)),0) AS titles, COALESCE(SUM((SELECT COUNT(*) FROM yume_collection_likes l WHERE l.collection_id = c.id)),0) AS likes FROM yume_collections c WHERE c.user_id = ? AND c.is_public = 1").bind(userId).first<{ count: number; titles: number; likes: number }>(),
    isOwner ? database.prepare("SELECT frame_level FROM yume_support_frame_unlocks WHERE user_id = ? ORDER BY frame_level").bind(userId).all<{ frame_level: number }>() : Promise.resolve({ results: [] as Array<{ frame_level: number }> }),
  ]);
  const follow = viewerId && viewerId !== userId
    ? await database.prepare("SELECT 1 AS followed FROM yume_follows WHERE follower_id = ? AND followed_id = ?").bind(viewerId, userId).first()
    : null;
  return {
    private: false, id: userId,
    displayName: [account.user.telegram_first_name, account.user.telegram_last_name].filter(Boolean).join(" ") || account.user.telegram_username || "Пользователь",
    username: account.user.telegram_username, photoUrl: account.user.telegram_photo_url,
    bio: account.profile.bio, avatarFrame: isSupportFrame(account.profile.avatar_frame) ? account.profile.avatar_frame : plus ? account.profile.avatar_frame : null,
    visibility: account.profile.visibility, xp: isOwner ? xp : { level: xp.level, title: xp.title }, support: isOwner ? support : { level: support.level, title: support.title, asset: support.asset },
    availableSupportFrames: isOwner ? unlockedSupportFrames.results.map((row) => SUPPORT_FRAME_ASSETS[row.frame_level - 1]).filter(Boolean) : [],
    isPlus: plus, followers: Number(followers?.count ?? 0), following: Number(following?.count ?? 0),
    publicCollections: Number(collections?.count ?? 0), publicTitles: Number(collections?.titles ?? 0),
    collectionLikes: Number(collections?.likes ?? 0), isFollowing: Boolean(follow),
  };
}
async function ownedCollection(database: Database, userId: string, collectionId: string) {
  return database.prepare("SELECT id,title,description,cover_key,is_public,is_pinned,created_at,updated_at FROM yume_collections WHERE id = ? AND user_id = ?")
    .bind(collectionId, userId).first<Record<string, unknown>>();
}
async function createCollection(database: Database, userId: string, input: Record<string, unknown>) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!title || title.length > 50 || description.length > 250) return json({ error: "invalid_collection" }, 400);
  const plus = await plusActive(database, userId);
  const count = await database.prepare("SELECT COUNT(*) AS count FROM yume_collections WHERE user_id = ?").bind(userId).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= (plus ? PLUS_COLLECTIONS : FREE_COLLECTIONS)) return json({ error: "collection_limit_reached" }, 409);
  const id = crypto.randomUUID();
  const cover = typeof input.coverKey === "string" && /^YUBERA_Collection_Cover_[A-Za-z_]+\.webp$/.test(input.coverKey) ? input.coverKey : null;
  await database.prepare("INSERT INTO yume_collections(id,user_id,title,description,cover_key,is_public) VALUES(?,?,?,?,?,?)")
    .bind(id, userId, title, description, cover, input.isPublic === true ? 1 : 0).run();
  return json({ ok: true, id });
}
async function collectionsFor(database: Database, ownerId: string, viewerId: string, includePrivate: boolean) {
  const where = includePrivate ? "c.user_id = ?" : "c.user_id = ? AND c.is_public = 1";
  const rows = await database.prepare(`SELECT c.id,c.title,c.description,c.cover_key,c.is_public,c.is_pinned,c.created_at,
    (SELECT COUNT(*) FROM yume_collection_items i WHERE i.collection_id = c.id) AS title_count,
    (SELECT COUNT(*) FROM yume_collection_likes l WHERE l.collection_id = c.id) AS like_count,
    EXISTS(SELECT 1 FROM yume_collection_likes l WHERE l.collection_id = c.id AND l.user_id = ?) AS liked
    FROM yume_collections c WHERE ${where} ORDER BY c.is_pinned DESC,c.updated_at DESC LIMIT 100`)
    .bind(viewerId, ownerId).all<Record<string, unknown>>();
  return rows.results;
}
export async function handleYuberaCommunity(request: Request): Promise<Response> {
  const database = db();
  if (!database) return json({ error: "database_unavailable" }, 503);
  const userId = await getAuthenticatedYumeUserId(request);
  const url = new URL(request.url);
  if (request.method === "GET") {
    const action = url.searchParams.get("action") ?? "me";
    if (action === "me") {
      if (!userId) return json({ authenticated: false }, 401);
      const [profile, collections] = await Promise.all([
        profileSummary(database, userId, userId), collectionsFor(database, userId, userId, true),
      ]);
      return json({ authenticated: true, profile, collections });
    }
    if (action === "profile") {
      const target = url.searchParams.get("userId") ?? "";
      if (!target || target.length > 128) return json({ error: "invalid_user" }, 400);
      const profile = await profileSummary(database, target, userId);
      if (!profile) return json({ error: "not_found" }, 404);
      if ("private" in profile && profile.private) return json({ error: "profile_private" }, 403);
      const collections = await collectionsFor(database, target, userId ?? "", false);
      return json({ profile, collections });
    }
    if (action === "friends") {
      if (!userId) return json({ error: "authentication_required" }, 401);
      const query = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
      const page = Math.max(0, Math.min(1000, Number.parseInt(url.searchParams.get("page") ?? "0", 10) || 0));
      const offset = page * 30;
      if (query) {
        const rows = await database.prepare(`SELECT u.id,u.telegram_first_name,u.telegram_last_name,u.telegram_username,u.telegram_photo_url,
          EXISTS(SELECT 1 FROM yume_follows f WHERE f.follower_id = ? AND f.followed_id = u.id) AS is_following
          FROM yume_users u JOIN yume_profiles p ON p.user_id = u.id
          WHERE p.visibility = 'public' AND u.id <> ?
          AND (lower(u.telegram_first_name || ' ' || COALESCE(u.telegram_last_name,'')) LIKE lower(?) OR lower(COALESCE(u.telegram_username,'')) LIKE lower(?))
          ORDER BY u.telegram_first_name,u.id LIMIT 30 OFFSET ?`)
          .bind(userId, userId, `%${query}%`, `%${query.replace(/^@/, "")}%`, offset).all<UserRow & { is_following: number }>();
        return json({ users: rows.results, hasMore: rows.results.length === 30 });
      }
      if (url.searchParams.get("direction") === "followers") {
        const rows = await database.prepare(`SELECT u.id,u.telegram_first_name,u.telegram_last_name,u.telegram_username,u.telegram_photo_url,f.created_at,
          EXISTS(SELECT 1 FROM yume_follows mine WHERE mine.follower_id = ? AND mine.followed_id = u.id) AS is_following
          FROM yume_follows f JOIN yume_users u ON u.id = f.follower_id JOIN yume_profiles p ON p.user_id = u.id
          WHERE p.visibility = 'public' AND f.followed_id = ? ORDER BY f.created_at DESC LIMIT 30 OFFSET ?`).bind(userId, userId, offset).all<UserRow & { created_at: string; is_following: number }>();
        return json({ users: rows.results, hasMore: rows.results.length === 30 });
      }
      const rows = await database.prepare(`SELECT u.id,u.telegram_first_name,u.telegram_last_name,u.telegram_username,u.telegram_photo_url,f.created_at
        FROM yume_follows f JOIN yume_users u ON u.id = f.followed_id JOIN yume_profiles p ON p.user_id = u.id
        WHERE p.visibility = 'public' AND f.follower_id = ? ORDER BY f.created_at DESC LIMIT 30 OFFSET ?`).bind(userId, offset).all<UserRow & { created_at: string }>();
      return json({ users: rows.results, hasMore: rows.results.length === 30 });
    }
    if (action === "recommendations") {
      if (!userId) return json({ error: "authentication_required" }, 401);
      const page = Math.max(0, Math.min(1000, Number.parseInt(url.searchParams.get("page") ?? "0", 10) || 0));
      const rows = await database.prepare(`SELECT u.id,u.telegram_first_name,u.telegram_last_name,u.telegram_username,u.telegram_photo_url
        FROM yume_users u JOIN yume_profiles p ON p.user_id = u.id
        WHERE p.visibility = 'public' AND u.id <> ?
        AND NOT EXISTS(SELECT 1 FROM yume_follows f WHERE f.follower_id = ? AND f.followed_id = u.id)
        ORDER BY u.telegram_first_name,u.id LIMIT 12 OFFSET ?`).bind(userId, userId, page * 12).all<UserRow>();
      return json({ users: rows.results, hasMore: rows.results.length === 12 });
    }
    if (action === "collection") {
      const collectionId = url.searchParams.get("id") ?? "";
      const row = await database.prepare("SELECT c.*,u.id AS owner_id,p.visibility FROM yume_collections c JOIN yume_users u ON u.id = c.user_id JOIN yume_profiles p ON p.user_id = u.id WHERE c.id = ?")
        .bind(collectionId).first<Record<string, unknown> & { owner_id: string; visibility: string }>();
      if (!row || (row.owner_id !== userId && (row.visibility !== "public" || Number(row.is_public) !== 1))) return json({ error: "not_found" }, 404);
      const items = await database.prepare("SELECT anime_id,position,added_at FROM yume_collection_items WHERE collection_id = ? ORDER BY position,added_at")
        .bind(collectionId).all<{ anime_id: string; position: number; added_at: string }>();
      return json({ collection: row, items: items.results });
    }
    return json({ error: "unknown_action" }, 400);
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "cross_origin_request" }, 403);
  if (!userId) return json({ error: "authentication_required" }, 401);
  let input: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 24_000) return json({ error: "request_too_large" }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "invalid_request" }, 400);
    input = parsed as Record<string, unknown>;
  } catch { return json({ error: "invalid_request" }, 400); }
  const action = input.action;
  if (action === "profile.update") {
    const bio = typeof input.bio === "string" ? input.bio.trim() : "";
    const visibility = input.visibility === "public" ? "public" : input.visibility === "private" ? "private" : null;
    if (bio.length > 250 || !visibility) return json({ error: "invalid_profile" }, 400);
    const plus = await plusActive(database, userId);
    const frame = input.avatarFrame === null ? null : profileAssetFrame(input.avatarFrame);
    if (input.avatarFrame !== null && !frame) return json({ error: "invalid_avatar_frame" }, 400);
    if (frame && isSupportFrame(frame)) {
      const unlocked = await database.prepare("SELECT 1 AS unlocked FROM yume_support_frame_unlocks WHERE user_id = ? AND frame_level = ?")
        .bind(userId, supportFrameLevel(frame)).first();
      if (!unlocked) return json({ error: "support_frame_locked" }, 403);
    } else if (frame && !plus) return json({ error: "plus_required" }, 403);
    await database.prepare("INSERT INTO yume_profiles(user_id,bio,visibility,avatar_frame) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET bio=excluded.bio,visibility=excluded.visibility,avatar_frame=excluded.avatar_frame,updated_at=CURRENT_TIMESTAMP")
      .bind(userId, bio, visibility, frame).run();
    return json({ ok: true });
  }
  if (action === "follow") {
    const target = typeof input.userId === "string" ? input.userId : "";
    if (!target || target === userId) return json({ error: "invalid_follow" }, 400);
    const targetProfile = await database.prepare("SELECT visibility FROM yume_profiles WHERE user_id = ?").bind(target).first<{ visibility: string }>();
    if (!targetProfile) return json({ error: "not_found" }, 404);
    if (targetProfile.visibility !== "public") return json({ error: "profile_private" }, 403);
    if (input.following === true) {
      await database.prepare("INSERT OR IGNORE INTO yume_follows(follower_id,followed_id) VALUES(?,?)").bind(userId, target).run();
    } else {
      await database.prepare("DELETE FROM yume_follows WHERE follower_id = ? AND followed_id = ?").bind(userId, target).run();
    }
    return json({ ok: true, following: input.following === true });
  }
  if (action === "collection.create") return createCollection(database, userId, input);
  if (action === "collection.pin" || action === "collection.delete" || action === "collection.update") {
    const id = typeof input.id === "string" ? input.id : "";
    if (!id) return json({ error: "invalid_collection" }, 400);
    const owned = await ownedCollection(database, userId, id);
    if (!owned) return json({ error: "not_found" }, 404);
    if (action === "collection.pin") {
      await database.prepare("UPDATE yume_collections SET is_pinned = ?,updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .bind(input.pinned === true ? 1 : 0, id, userId).run();
      return json({ ok: true });
    }
    if (action === "collection.delete") {
      await database.prepare("DELETE FROM yume_collections WHERE id = ? AND user_id = ?").bind(id, userId).run();
      return json({ ok: true });
    }
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const description = typeof input.description === "string" ? input.description.trim() : "";
    if (!title || title.length > 50 || description.length > 250) return json({ error: "invalid_collection" }, 400);
    const cover = typeof input.coverKey === "string" && /^YUBERA_Collection_Cover_[A-Za-z_]+\.webp$/.test(input.coverKey) ? input.coverKey : null;
    await database.prepare("UPDATE yume_collections SET title=?,description=?,cover_key=?,is_public=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?")
      .bind(title, description, cover, input.isPublic === true ? 1 : 0, id, userId).run();
    return json({ ok: true });
  }
  if (action === "collection.item.add" || action === "collection.item.remove") {
    const id = typeof input.id === "string" ? input.id : "";
    const animeId = validId(input.animeId) ? input.animeId : "";
    if (!id || !animeId) return json({ error: "invalid_collection_item" }, 400);
    const owned = await ownedCollection(database, userId, id);
    if (!owned) return json({ error: "not_found" }, 404);
    if (action === "collection.item.remove") {
      await database.prepare("DELETE FROM yume_collection_items WHERE collection_id = ? AND anime_id = ?").bind(id, animeId).run();
      return json({ ok: true });
    }
    let catalogueAnime: Awaited<ReturnType<typeof getR2Anime>>;
    try { catalogueAnime = await getR2Anime(animeId); }
    catch { return json({ error: "catalog_unavailable" }, 503); }
    if (!catalogueAnime) return json({ error: "anime_not_found" }, 404);
    const plus = await plusActive(database, userId);
    const count = await database.prepare("SELECT COUNT(*) AS count FROM yume_collection_items WHERE collection_id = ?").bind(id).first<{ count: number }>();
    const exists = await database.prepare("SELECT 1 AS found FROM yume_collection_items WHERE collection_id = ? AND anime_id = ?").bind(id, animeId).first();
    if (!exists && Number(count?.count ?? 0) >= (plus ? PLUS_TITLES : FREE_TITLES)) return json({ error: "collection_title_limit_reached" }, 409);
    if (!database.batch) return json({ error: "atomic_xp_batch_unavailable" }, 503);
    await database.batch([
      database.prepare("INSERT OR IGNORE INTO yume_collection_items(collection_id,anime_id,position) VALUES(?,?,?)")
        .bind(id, animeId, Number(count?.count ?? 0)),
      database.prepare("INSERT OR IGNORE INTO yume_xp_ledger(id,user_id,event_key,event_type,amount,metadata_json) SELECT ?,?,?,'collection_add',2,? WHERE changes()=1")
        .bind(crypto.randomUUID(), userId, `collection-add:${id}:${animeId}`, JSON.stringify({ collectionId: id, animeId })),
      database.prepare("INSERT OR IGNORE INTO yume_xp_ledger(id,user_id,event_key,event_type,amount,metadata_json) SELECT ?,?,?,'collection_milestone',15,? WHERE (SELECT COUNT(*) FROM yume_collection_items WHERE collection_id=?)>=3")
        .bind(crypto.randomUUID(), userId, `collection-milestone:${id}`, JSON.stringify({ collectionId: id }), id),
    ]);
    return json({ ok: true });
  }
  if (action === "collection.like") {
    const id = typeof input.id === "string" ? input.id : "";
    const collection = await database.prepare("SELECT c.id FROM yume_collections c JOIN yume_profiles p ON p.user_id=c.user_id WHERE c.id=? AND c.is_public=1 AND p.visibility='public'")
      .bind(id).first();
    if (!collection) return json({ error: "not_found" }, 404);
    if (input.liked === true) await database.prepare("INSERT OR IGNORE INTO yume_collection_likes(collection_id,user_id) VALUES(?,?)").bind(id, userId).run();
    else await database.prepare("DELETE FROM yume_collection_likes WHERE collection_id=? AND user_id=?").bind(id, userId).run();
    return json({ ok: true, liked: input.liked === true });
  }
  return json({ error: "unknown_action" }, 400);
}
