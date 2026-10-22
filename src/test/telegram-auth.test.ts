import { describe, expect, it } from "vitest";
import { validateTelegramInitData } from "@/data/telegram-auth.server";

const BOT_TOKEN = "test-bot-token-for-signature-tests";

async function signInitData(fields: Record<string, string>, token = BOT_TOKEN): Promise<string> {
  const checkString = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => key + "=" + value)
    .join("\n");
  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secret = await crypto.subtle.sign("HMAC", secretKey, encoder.encode(token));
  const signingKey = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", signingKey, encoder.encode(checkString));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return new URLSearchParams({ ...fields, hash }).toString();
}

describe("Telegram Mini App initData validation", () => {
  it("accepts correctly signed, recent initData and returns parsed user data", async () => {
    const now = Date.now();
    const initData = await signInitData({
      auth_date: String(Math.floor(now / 1000)),
      query_id: "AAE-test-query",
      user: JSON.stringify({ id: 12345, first_name: "Yume", username: "yume_test" }),
    });

    const result = await validateTelegramInitData(initData, BOT_TOKEN, now);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe(12345);
      expect(result.user.firstName).toBe("Yume");
      expect(result.user.username).toBe("yume_test");
    }
  });

  it("rejects tampered initData", async () => {
    const now = Date.now();
    const initData = await signInitData({
      auth_date: String(Math.floor(now / 1000)),
      user: JSON.stringify({ id: 12345, first_name: "Yume" }),
    });
    const tampered = initData.replace("Yume", "Attacker");

    const result = await validateTelegramInitData(tampered, BOT_TOKEN, now);

    expect(result).toEqual({ ok: false, error: "invalid_signature" });
  });

  it("rejects stale initData", async () => {
    const now = Date.now();
    const initData = await signInitData({
      auth_date: String(Math.floor(now / 1000) - 600),
      user: JSON.stringify({ id: 12345, first_name: "Yume" }),
    });

    const result = await validateTelegramInitData(initData, BOT_TOKEN, now);

    expect(result).toEqual({ ok: false, error: "auth_data_expired" });
  });

  it("rejects missing or malformed user identity", async () => {
    const now = Date.now();
    const initData = await signInitData({
      auth_date: String(Math.floor(now / 1000)),
      user: JSON.stringify({ first_name: "No numeric id" }),
    });

    const result = await validateTelegramInitData(initData, BOT_TOKEN, now);

    expect(result).toEqual({ ok: false, error: "invalid_user" });
  });
});
