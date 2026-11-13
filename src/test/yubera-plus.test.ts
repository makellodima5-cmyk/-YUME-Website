import {describe,expect,it} from "vitest";
import {isValidPlusPrice,isValidPlusGrantDays,normalizePlusGrantUsername,resolveInitialPlusExpiry,YUBERA_PLUS_PERIOD_SECONDS,calculateYuberaPlusPlanPrice} from "@/data/yubera-plus.server";
describe("YUBERA Plus",()=>{it("validates Stars price bounds",()=>{expect(isValidPlusPrice(1)).toBe(true);expect(isValidPlusPrice(10000)).toBe(true);expect(isValidPlusPrice(0)).toBe(false);expect(isValidPlusPrice(-1)).toBe(false);expect(isValidPlusPrice(1.5)).toBe(false);expect(isValidPlusPrice(10001)).toBe(false);expect(isValidPlusPrice("250")).toBe(false);});it("uses Telegram's fixed period",()=>expect(YUBERA_PLUS_PERIOD_SECONDS).toBe(2592000));it("uses Telegram expiration or 30 days",()=>{const now=1800000000000;expect(resolveInitialPlusExpiry(now/1000+2592000,now)).toBe(now+2592000000);expect(resolveInitialPlusExpiry(undefined,now)).toBe(now+2592000000);});});

it("guards payment ledger and subscription updates in one atomic batch",async()=>{const source=await import("node:fs/promises").then(m=>m.readFile("src/data/yubera-plus.server.ts","utf8"));expect(source).toContain("if(!d.batch)throw new Error(\"atomic_payment_batch_unavailable\")");expect(source).toContain("WHERE changes()=1");expect(source).toContain("d.batch([");expect(source).toContain("WHERE changes()=1");expect(source).toContain("price_changed_concurrently");expect(source).toContain("plus_price_not_configured");expect(source).toContain("const n=Number(x?.setting_value??0);return isValidPlusPrice(n)?n:0;");});


it("sets the approved 100-Star price and includes renewal and permanent support-frame state in migration 9",async()=>{const migration=await import("node:fs/promises").then(m=>m.readFile("migrations-clean/0009_yubera_plus_recurring.sql","utf8"));expect(migration).toContain("setting_value = '100'");expect(migration).toContain("INSERT OR IGNORE INTO yume_plus_settings");expect(migration).toContain("renewal_failed_at TEXT");expect(migration).toContain("CREATE TABLE IF NOT EXISTS yume_support_frame_unlocks");expect(migration).toContain(">=10000");expect(migration).toContain("INSERT INTO yume_plus_audit_log");
expect(migration).not.toContain("ALTER TABLE yume_profiles");expect(migration).not.toContain("ALTER TABLE yume_follows");expect(migration).not.toContain("ALTER TABLE yume_collections");expect(migration).toContain("CREATE TABLE IF NOT EXISTS yume_profiles");expect(migration).toContain("CREATE TABLE IF NOT EXISTS yume_follows");expect(migration).toContain("CREATE TABLE IF NOT EXISTS yume_collections");});


it("does not offer checkout at an unconfigured price and exposes the admin setup state",async()=>{const [panel,admin]=await Promise.all([import("node:fs/promises").then(m=>m.readFile("src/components/yume/YuberaPlusPanel.tsx","utf8")),import("node:fs/promises").then(m=>m.readFile("src/components/yume/YuberaPlusAdminPanel.tsx","utf8"))]);expect(panel).toContain("status && status.price < 1");expect(panel).toContain("Цена подписки ещё не настроена.");
expect(panel).toContain("status.price > 0");expect(admin).toContain("Цена не задана");});


it("persists failed recurring payments and gives the user recovery guidance",async()=>{const [server,panel,migration]=await Promise.all([import("node:fs/promises").then(m=>m.readFile("src/data/yubera-plus.server.ts","utf8")),import("node:fs/promises").then(m=>m.readFile("src/components/yume/YuberaPlusPanel.tsx","utf8")),import("node:fs/promises").then(m=>m.readFile("migrations-clean/0009_yubera_plus_recurring.sql","utf8"))]);expect(server).toContain("renewal_failed_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END");expect(server).toContain("renewalFailedAt:latest?.renewal_failed_at??null");expect(panel).toContain("Telegram не смог выполнить автопродление.");expect(migration).toContain("renewal_failed_at TEXT");});


it("renders the four approved Plus benefits without promising an active AI feature",async()=>{const panel=await import("node:fs/promises").then(m=>m.readFile("src/components/yume/YuberaPlusPanel.tsx","utf8"));for(const phrase of ["AI-помощник","Скоро","Рекомендации, создание подборок и помощь в поиске аниме","Расширенные подборки","Больше лимитов и гибкие настройки","Эксклюзивные рамки аватара","Специальные рамки только для подписчиков Plus","Эксклюзивный статус","Особый статус YUBERA Plus в профиле"])expect(panel).toContain(phrase);});


describe("YUBERA Plus admin grants",()=>{
 it("normalizes Telegram usernames without accepting malformed values",()=>{
  expect(normalizePlusGrantUsername("@Example_user")).toBe("Example_user");
  expect(normalizePlusGrantUsername("  Example_user  ")).toBe("Example_user");
  expect(normalizePlusGrantUsername("abc")).toBeNull();
  expect(normalizePlusGrantUsername("@bad-name")).toBeNull();
  expect(normalizePlusGrantUsername("@")).toBeNull();
  expect(normalizePlusGrantUsername(null)).toBeNull();
 });
 it("limits manual grant durations to whole days from 1 to 3650",()=>{
  expect(isValidPlusGrantDays(1)).toBe(true);
  expect(isValidPlusGrantDays(3650)).toBe(true);
  expect(isValidPlusGrantDays(0)).toBe(false);
  expect(isValidPlusGrantDays(3651)).toBe(false);
  expect(isValidPlusGrantDays(30.5)).toBe(false);
  expect(isValidPlusGrantDays("30")).toBe(false);
 });
 it("keeps manual grants behind both Telegram admin identity and admin password checks",async()=>{
  const source=await import("node:fs/promises").then(m=>m.readFile("src/data/yubera-plus.server.ts","utf8"));
  expect(source).toContain('if(!admin)return json({isAdmin:false,error:"admin_required"},403)');
  expect(source).toContain('if(!await hasAdminPasswordSession(r,e))return json({isAdmin:false,error:"admin_password_required"},428)');
  expect(source).toContain('if(input.action==="grant-by-username")');
  expect(source).toContain("lower(telegram_username)=lower(?)");
  expect(source).toContain("plus_granted_by_admin");
  expect(source).toContain("d.batch([");
 });
 it("shows the username grant form and reports successful grants in the admin panel",async()=>{
  const panel=await import("node:fs/promises").then(m=>m.readFile("src/components/yume/YuberaPlusAdminPanel.tsx","utf8"));
  expect(panel).toContain("grant-by-username");
  expect(panel).toContain("Telegram username");
  expect(panel).toContain("Выдать Plus");
  expect(panel).toContain("Plus granted");
  expect(panel).toContain("История операций Plus");
 });
});

it("calculates the one-month and discounted three-month Plus plans from the configured monthly price",()=>{
 expect(calculateYuberaPlusPlanPrice(199,1)).toBe(199);
 expect(calculateYuberaPlusPlanPrice(199,3)).toBe(496);
 expect(calculateYuberaPlusPlanPrice(100,3)).toBe(249);
 expect(calculateYuberaPlusPlanPrice(5000,3)).toBe(0);
});
it("stores the selected 30- or 90-day term in the server-created invoice payload without changing the D1 schema",async()=>{
 const server=await import("node:fs/promises").then(m=>m.readFile("src/data/yubera-plus.server.ts","utf8"));
 expect(server).toContain('payload="yubera_plus:"+periodDays+":"+id');
 expect(server).toContain('payload.startsWith("yubera_plus:90:")?90:30');
 expect(server).toContain("monthlyPrice*3*0.83");
});
