import { env as cloudflareEnv } from "cloudflare:workers";
import { validateTelegramInitData } from "@/data/telegram-init-data";

type TelegramEnvironment = { TELEGRAM_BOT_TOKEN?: string };

export async function handleTelegramInitData(request: Request): Promise<Response> {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_request" }), { status: 400, headers });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as Record<string, unknown>).initData !== "string") {
    return new Response(JSON.stringify({ error: "invalid_request" }), { status: 400, headers });
  }

  const env = cloudflareEnv as unknown as TelegramEnvironment;
  const token = typeof env.TELEGRAM_BOT_TOKEN === "string" ? env.TELEGRAM_BOT_TOKEN : "";
  if (!token) {
    return new Response(JSON.stringify({ error: "telegram_auth_not_configured" }), { status: 503, headers });
  }

  const result = await validateTelegramInitData((body as Record<string, string>).initData, token);
  if (!result.ok) {
    const status = result.error === "invalid_request" ? 400 : 401;
    return new Response(JSON.stringify({ error: result.error }), { status, headers });
  }

  // Validation alone does not create an account or issue a YUME session.
  return new Response(
    JSON.stringify({
      valid: true,
      user: {
        id: result.user.id,
        firstName: result.user.firstName,
        ...(result.user.lastName ? { lastName: result.user.lastName } : {}),
        ...(result.user.username ? { username: result.user.username } : {}),
        ...(result.user.languageCode ? { languageCode: result.user.languageCode } : {}),
      },
    }),
    { status: 200, headers },
  );
}
