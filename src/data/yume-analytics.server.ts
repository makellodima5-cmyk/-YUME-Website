import { env as cloudflareEnv } from "cloudflare:workers";

type Env = Record<string, unknown> & { YUME_DB?: unknown; TELEGRAM_ADMIN_ID?: string };
type Stmt = { bind(...values: unknown[]): Stmt; first<T=Record<string,unknown>>(): Promise<T|null>; all<T=Record<string,unknown>>(): Promise<{results:T[]}>; run(): Promise<unknown> };
type DB = { prepare(sql:string): Stmt; batch(stmts:Stmt[]): Promise<unknown[]> };
type Runtime = typeof globalThis & { __YUME_RUNTIME_ENV__?: unknown };
const COOKIE="__Host-yume-session";
function getEnv():Env { try { const e=cloudflareEnv as unknown as Env; if(e&&typeof e==="object") return e; } catch {} const e=(globalThis as Runtime).__YUME_RUNTIME_ENV__; return e&&typeof e==="object"?e as Env:{}; }
function dbFrom(e:Env):DB|null { return e.YUME_DB&&typeof e.YUME_DB==="object"?e.YUME_DB as DB:null; }
function json(body:unknown,status=200):Response { return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}}); }
function cookie(req:Request):string|null { for(const p of (req.headers.get("cookie")??"").split(";")){const i=p.indexOf("=");if(i>=0&&p.slice(0,i).trim()===COOKIE)return p.slice(i+1).trim()||null;}return null; }
async function hash(s:string):Promise<string>{const d=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));return Array.from(d,b=>b.toString(16).padStart(2,"0")).join("");}
function sameOrigin(req:Request):boolean {const origin=req.headers.get("origin");if(origin){try{return new URL(origin).origin===new URL(req.url).origin;}catch{return false;}}const ref=req.headers.get("referer");if(ref){try{return new URL(ref).origin===new URL(req.url).origin;}catch{return false;}}return req.headers.get("sec-fetch-site")==="same-origin";}
async function authorized(req:Request,e:Env,db:DB):Promise<boolean>{const admin=typeof e.TELEGRAM_ADMIN_ID==="string"?e.TELEGRAM_ADMIN_ID.trim():"";const token=cookie(req);if(!/^\d{1,20}$/.test(admin)||!token)return false;const s=await db.prepare("SELECT u.telegram_user_id,s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id=s.user_id WHERE s.token_hash=? AND u.provider='telegram'").bind(await hash(token)).first<{telegram_user_id:string|null;expires_at:number}>();return Boolean(s&&s.expires_at>Date.now()&&s.telegram_user_id===admin);}
async function schema(db:DB):Promise<void>{await db.batch([
db.prepare("CREATE TABLE IF NOT EXISTS yume_analytics_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_date TEXT NOT NULL, event_hour INTEGER NOT NULL, visitor_hash TEXT NOT NULL, page_path TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_analytics_date ON yume_analytics_events(event_date)"),
db.prepare("CREATE INDEX IF NOT EXISTS idx_yume_analytics_visitor ON yume_analytics_events(event_date,visitor_hash)"),
]);}
function day(d:Date):string{return d.toISOString().slice(0,10);}
async function metrics(db:DB,now:Date){const today=day(now),since24=new Date(now.getTime()-86400000),since7=new Date(now.getTime()-7*86400000),since30=new Date(now.getTime()-30*86400000);const count=async(sql:string,...v:unknown[])=>{const r=await db.prepare(sql).bind(...v).first<{n:number}>();return Number(r?.n??0);};const [hours,week,month,all,unique24,uniqueWeek,uniqueMonth,uniqueAll,daily]=await Promise.all([
count("SELECT COUNT(*) n FROM yume_analytics_events WHERE created_at >= ?",since24.toISOString().replace("T"," ").slice(0,19)),
count("SELECT COUNT(*) n FROM yume_analytics_events WHERE event_date >= ?",day(since7)),
count("SELECT COUNT(*) n FROM yume_analytics_events WHERE event_date >= ?",day(since30)),
count("SELECT COUNT(*) n FROM yume_analytics_events"),
count("SELECT COUNT(DISTINCT visitor_hash) n FROM yume_analytics_events WHERE created_at >= ?",since24.toISOString().replace("T"," ").slice(0,19)),
count("SELECT COUNT(DISTINCT visitor_hash) n FROM yume_analytics_events WHERE event_date >= ?",day(since7)),
count("SELECT COUNT(DISTINCT visitor_hash) n FROM yume_analytics_events WHERE event_date >= ?",day(since30)),
count("SELECT COUNT(DISTINCT visitor_hash) n FROM yume_analytics_events"),
db.prepare("SELECT event_date AS date,COUNT(*) AS visits,COUNT(DISTINCT visitor_hash) AS visitors FROM yume_analytics_events WHERE event_date >= ? GROUP BY event_date ORDER BY event_date").bind(day(since7)).all<{date:string;visits:number;visitors:number}>()
]);return {periods:{hours:{visits:hours,visitors:unique24},week:{visits:week,visitors:uniqueWeek},month:{visits:month,visitors:uniqueMonth},all:{visits:all,visitors:uniqueAll}},daily:daily.results,updatedAt:now.toISOString()};}
export async function handleYumeAnalytics(req:Request):Promise<Response>{const e=getEnv(),db=dbFrom(e);if(!db)return json({error:"Analytics database is unavailable."},503);try{await schema(db);if(req.method==="POST"){if(!sameOrigin(req))return json({error:"Forbidden origin."},403);const body=await req.json().catch(()=>null) as {path?:unknown}|null;const path=typeof body?.path==="string"&&body.path.startsWith("/")?body.path.slice(0,180):"/";const agent=req.headers.get("user-agent")??"";if(/bot|crawler|spider|headless/i.test(agent))return json({ok:true,ignored:true});const ip=req.headers.get("cf-connecting-ip")??"unknown";const salt=day(new Date());const visitor=await hash(ip+"|"+agent.slice(0,300)+"|yume-analytics-v1");const now=new Date();await db.prepare("INSERT INTO yume_analytics_events(event_date,event_hour,visitor_hash,page_path,created_at) VALUES(?,?,?,?,?)").bind(day(now),now.getUTCHours(),visitor,path,now.toISOString().replace("T"," ").slice(0,19)).run();return json({ok:true});}if(req.method!=="GET")return json({error:"Method not allowed."},405);if(!await authorized(req,e,db))return json({error:"Unauthorized."},401);return json({ok:true,analytics:await metrics(db,new Date())});}catch(error){return json({error:error instanceof Error?error.message:"Analytics operation failed."},500);}}
