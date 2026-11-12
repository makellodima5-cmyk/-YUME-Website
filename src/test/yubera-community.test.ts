import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const moduleText = readFileSync(resolve(root, "src/data/yubera-community.server.ts"), "utf8");
const migration = readFileSync(resolve(root, "migrations-clean/0008_yubera_community_plus.sql"), "utf8");
const controls = readFileSync(resolve(root, "migrations-clean/0009_yubera_community_plus_controls.sql"), "utf8");

function sourceConstant(name: string): string {
  const match = moduleText.match(new RegExp("const " + name + " = \\\\[([\\\\s\\\\S]*?)\\\\] as const;"));
  if (!match) throw new Error("Missing source constant " + name);
  return match[1];
}
function sourceLevels(name: string): Array<{ name: string; min: number; max: number | null }> {
  return Array.from(sourceConstant(name).matchAll(/name: "([^"]+)", min: (\\d+), max: (\\d+|null)/g), match => ({
    name: match[1], min: Number(match[2]), max: match[3] === "null" ? null : Number(match[3]),
  }));
}
describe("YUBERA level and status catalog", () => {
  it("keeps the ten XP level names and thresholds in their documented order", () => {
    expect(sourceLevels("LEVELS")).toEqual([
      { name: "Начинающий зритель", min: 0, max: 49 },
      { name: "Любитель аниме", min: 50, max: 149 },
      { name: "Искатель историй", min: 150, max: 299 },
      { name: "Исследователь миров", min: 300, max: 499 },
      { name: "Коллекционер", min: 500, max: 749 },
      { name: "Знаток аниме", min: 750, max: 999 },
      { name: "Хранитель историй", min: 1000, max: 1499 },
      { name: "Мастер YUBERA", min: 1500, max: 2199 },
      { name: "Архивариус YUBERA", min: 2200, max: 3199 },
      { name: "Легенда YUBERA", min: 3200, max: null },
    ]);
  });
  it("keeps support status thresholds fixed", () => {
    expect(sourceLevels("SUPPORT_STATUSES")).toEqual([
      { name: "Пока без статуса", min: 0, max: null },
      { name: "Союзник", min: 50, max: null },
      { name: "Сторонник", min: 1000, max: null },
      { name: "Преданный участник", min: 2500, max: null },
      { name: "Почётный покровитель", min: 5000, max: null },
      { name: "Легенда YUBERA", min: 10000, max: null },
    ]);
  });
  it("uses an append-only XP ledger with unique user/event keys", () => {
    expect(migration).toContain("CREATE TABLE yume_xp_ledger");
    expect(migration).toContain("UNIQUE (user_id, event_key)");
    expect(migration).toContain("'first_rating'");
    expect(migration).toContain("'collection_item_added'");
    expect(migration).toContain("'collection_three_titles'");
    expect(migration).toContain("'episode_completed'");
    expect(migration).not.toMatch(/CREATE\\s+TRIGGER[\\s\\S]*?UPDATE\\s+yume_xp_ledger/i);
  });
  it("stores pinned collection and observed playback session fields in the next migration", () => {
    expect(controls).toContain("is_pinned");
    expect(controls).toContain("last_event_at_epoch_ms");
    expect(controls).toContain("accumulated_millis");
    expect(controls).toContain("completed_at");
  });
});
