import { describe, expect, it, vi } from "vitest";
import { ensureTelegramLibrarySyncSchema } from "@/data/telegram-library-schema.server";

describe("Telegram library sync schema bootstrap", () => {
  it("creates the missing sync table and index once per database object", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const statements: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        statements.push(sql);
        return { run };
      }),
    };

    await Promise.all([
      ensureTelegramLibrarySyncSchema(db),
      ensureTelegramLibrarySyncSchema(db),
      ensureTelegramLibrarySyncSchema(db),
    ]);

    expect(db.prepare).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(2);
    expect(statements[0]).toContain("CREATE TABLE IF NOT EXISTS yume_library_sync_items");
    expect(statements[1]).toContain("CREATE INDEX IF NOT EXISTS idx_yume_library_sync_items_user_updated");
  });

  it("retries after a transient D1 schema-bootstrap failure", async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error("temporary D1 error"))
      .mockResolvedValue({ success: true });
    const db = {
      prepare: vi.fn(() => ({ run })),
    };

    await expect(ensureTelegramLibrarySyncSchema(db)).rejects.toThrow("temporary D1 error");
    await expect(ensureTelegramLibrarySyncSchema(db)).resolves.toBeUndefined();

    expect(db.prepare).toHaveBeenCalledTimes(3);
    expect(run).toHaveBeenCalledTimes(3);
  });
});
