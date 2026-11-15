vi.mock("@/data/catalog-r2.server", () => ({
 readCatalogState: vi.fn(async () => ({
  schemaVersion: 1,
  revision: 1,
  updatedAt: "2026-11-15T00:00:00.000Z",
  items: [{
   id: "101", title: "Тестовое аниме", englishTitle: "Test Anime", original: "Test Anime",
   year: 2024, episodes: 12, rating: 8.2, genres: ["Фэнтези"], status: "Вышел",
   description: "Тестовая запись каталога", hue: 10, glyph: " test ", posterUrl: "https://images.example.test/101.jpg",
  }],
  exclusions: {},
  metadata: {},
  screenshots: {},
 })),
}));
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthenticatedYumeAccount } from "@/data/telegram-auth.server";
import { handleYuberaAiAccess, handleYuberaAiChat } from "@/data/yubera-ai.server";
const SECRET="yubera-ai-test-session-secret-at-least-32-characters";
const TOKEN="test-session-token-012345678901234567890123";
async function tokenHash(){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(TOKEN));
 return Array.from(new Uint8Array(signature),byte=>byte.toString(16).padStart(2,"0")).join("");
}
class FakeStatement {
 values:unknown[]=[];
 constructor(private readonly state:FakeDb,private readonly sql:string){}
 bind(...values:unknown[]){this.values=values;return this;}
 async first<T=Record<string,unknown>>():Promise<T|null>{
  if(this.sql.includes("FROM yume_sessions s JOIN yume_users"))return this.state.sessionHash===this.values[0]?{user_id:"user-1",expires_at:Date.now()+60000} as T:null;
  if(this.sql.includes("FROM yume_plus_subscriptions"))return this.state.plus?{active:1} as T:null;
  if(this.sql.includes("INSERT INTO yume_ai_daily_usage")){
   if(this.state.questions>=20)return null;
   this.state.questions++;
   return{questions:this.state.questions} as T;
  }
  if(this.sql.includes("FROM yume_ai_daily_usage"))return{questions:this.state.questions} as T;
  return null;
 }
 async all<T=Record<string,unknown>>():Promise<{results:T[]}>{return{results:[]};}
 async run(){
  if(this.sql.includes("INSERT INTO yume_ai_messages"))this.state.messageWrites++;
  return{meta:{changes:1}};
 }
}
class FakeDb {
 sessionHash="";
 plus=true;
 questions=0;
 messageWrites=0;
 prepare(sql:string){return new FakeStatement(this,sql);}
}
let previousEnvironment:unknown;
afterEach(()=>{
 if(previousEnvironment===undefined)delete (globalThis as typeof globalThis&{__YUME_RUNTIME_ENV__?:unknown}).__YUME_RUNTIME_ENV__;
 else (globalThis as typeof globalThis&{__YUME_RUNTIME_ENV__?:unknown}).__YUME_RUNTIME_ENV__=previousEnvironment;
 vi.unstubAllGlobals();
});
async function setup(plus=true){
 const db=new FakeDb();
 db.sessionHash=await tokenHash();
 db.plus=plus;
 previousEnvironment=(globalThis as typeof globalThis&{__YUME_RUNTIME_ENV__?:unknown}).__YUME_RUNTIME_ENV__;
 Object.assign(globalThis,{__YUME_RUNTIME_ENV__:{
  YUME_DB:db,YUME_AUTH_SESSION_SECRET:SECRET,YUME_AI_API_KEY:"test-only-key",
  YUME_AI_RATE_LIMITER:{limit:async()=>({success:true})},
 }});
 return{db,requestHeaders:{Cookie:"__Host-yume-session="+TOKEN,Origin:"https://yume.test"}};
}
describe("YUBERA AI authentication and topic checks",()=>{
 it("requires a valid authenticated Plus session",async()=>{
  const {requestHeaders}=await setup(false);
  const response=await handleYuberaAiAccess(new Request("https://yume.test/api/yubera/ai/access",{headers:requestHeaders}));
  expect(response.status).toBe(403);
  expect((await response.json()).error).toBe("plus_required");
 });
 it("rejects unrelated questions before provider inference and before daily quota debit",async()=>{
  const {db,requestHeaders}=await setup(true);
  const provider=vi.fn();
  vi.stubGlobal("fetch",provider);
  const response=await handleYuberaAiChat(new Request("https://yume.test/api/yubera/ai",{
   method:"POST",headers:{...requestHeaders,"Content-Type":"application/json"},
   body:JSON.stringify({message:"Сколько людей живёт на Земле?"}),
  }));
  expect(response.status).toBe(422);
  expect(db.questions).toBe(0);
  expect(provider).not.toHaveBeenCalled();
 });
 it("rejects a state-changing request without same-origin proof",async()=>{
  await setup(true);
  const response=await handleYuberaAiChat(new Request("https://yume.test/api/yubera/ai",{
   method:"POST",headers:{Cookie:"__Host-yume-session="+TOKEN,"Content-Type":"application/json"},
   body:JSON.stringify({message:"Порекомендуй мне аниме"}),
  }));
  expect(response.status).toBe(403);
 });
 it("does not consume a daily question when the AI provider is unavailable",async()=>{
  const {db,requestHeaders}=await setup(true);
  const provider=vi.fn(async()=>new Response(JSON.stringify({error:{message:"temporarily unavailable"}}),{status:503,headers:{"Content-Type":"application/json"}}));
  vi.stubGlobal("fetch",provider);
  const response=await handleYuberaAiChat(new Request("https://yume.test/api/yubera/ai",{
   method:"POST",headers:{...requestHeaders,"Content-Type":"application/json"},
   body:JSON.stringify({message:"Порекомендуй мне аниме"}),
  }));
  const payload=await response.json();
  expect(response.status).toBe(502);
  expect(payload.questionCharged).toBe(false);
  expect(db.questions).toBe(0);
  expect(db.messageWrites).toBe(0);
  expect(provider).toHaveBeenCalledOnce();
 });
 it("rejects a daily quota after 20 successful reservations",async()=>{
  const {db,requestHeaders}=await setup(true);
  db.questions=20;
  const provider=vi.fn();
  vi.stubGlobal("fetch",provider);
  const response=await handleYuberaAiChat(new Request("https://yume.test/api/yubera/ai",{
   method:"POST",headers:{...requestHeaders,"Content-Type":"application/json"},
   body:JSON.stringify({message:"Посоветуй интересное аниме"}),
  }));
  expect(response.status).toBe(429);
  expect(provider).not.toHaveBeenCalled();
 });
});
