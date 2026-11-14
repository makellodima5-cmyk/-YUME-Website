import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("Kodik voice-over subscription migration", () => {
  it("adds source IDs, per-user baselines and per-source check state", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations-clean/0012_kodik_voiceover_episode_subscriptions.sql"), "utf8");
    expect(sql).toContain("ADD COLUMN translation_id TEXT");
    expect(sql).toContain("ADD COLUMN translation_title TEXT");
    expect(sql).toContain("baseline_episode INTEGER NOT NULL DEFAULT 0");
    expect(sql).toContain("CREATE TABLE yume_kodik_episode_sources");
    expect(sql).toContain("PRIMARY KEY(anime_id,translation_id)");
  });
});
