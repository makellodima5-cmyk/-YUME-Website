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
});
