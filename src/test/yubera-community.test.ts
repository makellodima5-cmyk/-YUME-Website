import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("YUBERA community foundation", () => {
  it("declares private profiles, one-way follows, collections and idempotent XP storage", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations-clean/0008_yubera_community_plus.sql"), "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS yume_profiles");
    expect(sql).toContain("CHECK (visibility IN ('public','private'))");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS yume_follows");
    expect(sql).toContain("PRIMARY KEY (follower_id, followed_id)");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS yume_collections");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS yume_collection_items");
    expect(sql).toContain("event_key TEXT NOT NULL UNIQUE");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS yume_plus_subscriptions");
  });

  it("enforces profile visibility, collection ownership and Free/Plus caps in server handlers", async () => {
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    expect(server).toContain("profile.visibility !== \"public\"");
    expect(server).toContain("p.visibility = 'public'");
    expect(server).toContain("ownedCollection(database, userId, id)");
    expect(server).toContain("PLUS_COLLECTIONS : FREE_COLLECTIONS");
    expect(server).toContain("PLUS_TITLES : FREE_TITLES");
    expect(server).toContain("INSERT OR IGNORE INTO yume_xp_ledger");
    expect(server).toContain("LIMIT 30 OFFSET ?");
    expect(server).toContain("LIMIT 12 OFFSET ?");
  });

  it("exposes collection detail, catalogue add/remove, public profiles and people discovery in the UI", async () => {
    const component = await readFile(resolve(process.cwd(), "src/components/yume/YuberaProfileHub.tsx"), "utf8");
    expect(component).toContain('"collection-detail"');
    expect(component).toContain("Добавить аниме");
    expect(component).toContain("collection.item.add");
    expect(component).toContain("collection.item.remove");
    expect(component).toContain("Публичные подборки");
    expect(component).toContain("Загрузить ещё");
    expect(component).toContain("Найти людей");
  });

  it("awards collection XP atomically with unique-add and milestone guards", async () => {
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    expect(server).toContain("if (!database.batch) return json({ error: \"atomic_xp_batch_unavailable\" }, 503)");
    expect(server).toContain("WHERE changes()=1");
    expect(server).toContain("`collection-add:${id}:${animeId}`");
    expect(server).toContain("`collection-milestone:${id}`");
    expect(server).toContain("WHERE (SELECT COUNT(*) FROM yume_collection_items WHERE collection_id=?)>=3");
  });


  it("recalculates support status from confirmed donations after recorded refunds", async () => {
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    expect(server).toContain("LEFT JOIN yume_stars_refunds r ON r.telegram_payment_charge_id = d.telegram_payment_charge_id");
    expect(server).toContain("d.status = 'paid' AND r.telegram_payment_charge_id IS NULL");
    expect(server).toContain("progress:");
    expect(server).toContain("remaining:");
  });


  it("hides Plus-only avatar frames when the paid period is no longer active", async () => {
    const server = await readFile(resolve(process.cwd(), "src/data/yubera-community.server.ts"), "utf8");
    expect(server).toContain("avatarFrame: plus ? account.profile.avatar_frame : null");
    expect(server).toContain("expires_at > ?");
  });

});
