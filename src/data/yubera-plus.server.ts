import { env as cloudflareEnv } from "cloudflare:workers";
import { getAuthenticatedYumeUserId } from "@/data/telegram-auth.server";
import { hasAdminPasswordSession, isAdminPasswordConfigured } from "@/lib/admin-password.server";
type S={bind(...v:unknown[]):S;first<T=Record<string,unknown>>():Promise<T|null>;all<T=Record<string,unknown>>():Promise<{results:T[]}>;run():Promise<{meta?:{changes?:number}}>} ;
type DB={prepare(sql:string):S;batch?:(statements:S[])=>Promise<Array<{meta?:{changes?:number}}>>};
type E=Record<string,unknown>&{YUME_DB?:unknown;TELEGRAM_BOT_TOKEN?:string;TELEGRAM_ADMIN_ID?:string;YUME_AUTH_SESSION_SECRET?:string;YUME_ADMIN_PASSWORD?:string;TELEGRAM_STARS_RATE_LIMITER?:unknown};
type G=typeof globalThis&{__YUME_RUNTIME_ENV__?:unknown};
type Pay={currency?:string;total_amount?:number;invoice_payload?:string;telegram_payment_charge_id?:string;is_recurring?:boolean;is_first_recurring?:boolean;subscription_expiration_date?:number};
type Refund={currency?:string;total_amount?:number;telegram_payment_charge_id?:string};
type SubUpdate={user?:{id?:number};invoice_payload?:string;state?:string};
export const YUBERA_PLUS_PERIOD_SECONDS=2592000;
const PERIOD=2592000000,COOKIE="__Host-yume-session";
export function isValidPlusPrice(v:unknown):v is number{return typeof v==="number"&&Number.isSafeInteger(v)&&v>=1&&v<=10000;}
export function calculateYuberaPlusPlanPrice(monthlyPrice:number,months:1|3):number{if(!isValidPlusPrice(monthlyPrice))return 0;const amount=months===1?monthlyPrice:Math.round(monthlyPrice*3*0.83);return isValidPlusPrice(amount)?amount:0;}
export function normalizePlusGrantUsername(value:unknown):string|null{if(typeof value!=="string")return null;const username=value.trim().replace(/^@/,"");return /^[A-Za-z0-9_]{5,32}$/.test(username)?username:null;}
export function isValidPlusGrantDays(value:unknown):value is number{return typeof value==="number"&&Number.isSafeInteger(value)&&value>=1&&value<=3650;}
export function resolveInitialPlusExpiry(exp:number|undefined,now=Date.now()){return typeof exp==="number"&&Number.isSafeInteger(exp)&&exp*1000>now&&exp*1000<=now+PERIOD+300000?exp*1000:now+PERIOD;}
function env():E{try{return cloudflareEnv as unknown as E;}catch{const x=(globalThis as G).__YUME_RUNTIME_ENV__;return x&&typeof x==="object"?x as E:{ };}}
function db():DB|null{const x=env().YUME_DB;return x&&typeof x==="object"?x as DB:null;}
function json(x:unknown,s=200){return new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Vary":"Cookie"}});}
function origin(r:Request){const o=r.headers.get("origin");if(!o)return false;try{return new URL(o).origin===new URL(r.url).origin;}catch{return false;}}
function cookie(r:Request,n:string){for(const p of(r.headers.get("cookie")??"").split(";")){const i=p.indexOf("=");if(i>=0&&p.slice(0,i).trim()===n)return p.slice(i+1).trim();}return "";}
async function sign(v:string,s:string){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(s),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,"0")).join("");}
async function tg(t:string,m:string,b:Record<string,unknown>){const r=await fetch("https://api.telegram.org/bot"+t+"/"+m,{method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(7000),body:JSON.stringify(b)});const x=await r.json().catch(()=>({})) as {ok?:boolean;result?:unknown;description?:string};return{ok:r.ok&&x.ok===true,result:x.result,description:x.description};}
async function price(d:DB){const x=await d.prepare("SELECT setting_value FROM yume_plus_settings WHERE setting_key='price_xtr'").first<{setting_value:string}>();const n=Number(x?.setting_value??0);return isValidPlusPrice(n)?n:0;}
async function active(d:DB,u:string){return d.prepare("SELECT id,expires_at,auto_renew,is_recurring,telegram_payment_charge_id,renewal_failed_at FROM yume_plus_subscriptions WHERE user_id=? AND status='active' AND expires_at>? ORDER BY expires_at DESC LIMIT 1").bind(u,Date.now()).first<{id:string;expires_at:number;auto_renew:number;is_recurring:number;telegram_payment_charge_id:string|null;renewal_failed_at:string|null}>();}
export async function handleYuberaPlus(r:Request):Promise<Response>{
 if(!["GET","POST"].includes(r.method))return json({error:"method_not_allowed"},405);if(r.method==="POST"&&!origin(r))return json({error:"cross_origin_request"},403);
 const d=db();if(!d)return json({error:"database_unavailable"},503);const uid=await getAuthenticatedYumeUserId(r);if(!uid)return json({error:"authentication_required"},401);
 const user=await d.prepare("SELECT id,telegram_user_id FROM yume_users WHERE id=?").bind(uid).first<{id:string;telegram_user_id:string}>();if(!user)return json({error:"user_not_found"},404);
 const p=await price(d),sub=await active(d,uid);
 if(r.method==="GET"){const latest=await d.prepare("SELECT renewal_failed_at FROM yume_plus_subscriptions WHERE user_id=? ORDER BY starts_at DESC,created_at DESC LIMIT 1").bind(uid).first<{renewal_failed_at:string|null}>();return json({price:p,threeMonthPrice:calculateYuberaPlusPlanPrice(p,3),threeMonthDiscountPercent:17,periodDays:30,periodSeconds:YUBERA_PLUS_PERIOD_SECONDS,isPlus:Boolean(sub),renewalFailedAt:latest?.renewal_failed_at??null,subscription:sub?{active:true,expiresAt:sub.expires_at,autoRenew:sub.auto_renew===1,isRecurring:sub.is_recurring===1,renewalFailedAt:sub.renewal_failed_at}:null});}
 let body:unknown;try{const raw=await r.text();if(raw.length>4096)return json({error:"request_too_large"},413);body=JSON.parse(raw);}catch{return json({error:"invalid_json"},400);}if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"invalid_request"},400);
 const x=body as Record<string,unknown>;
 if(x.action==="create-invoice"){
  if(!isValidPlusPrice(p))return json({error:"plus_price_not_configured"},503);
  if(sub)return json({error:"subscription_already_active",expiresAt:sub.expires_at},409);
  const months=x.months===undefined?1:x.months;if(months!==1&&months!==3)return json({error:"invalid_plus_period",allowed:[1,3]},400);
  const amount=calculateYuberaPlusPlanPrice(p,months);if(!isValidPlusPrice(amount))return json({error:"plus_plan_price_out_of_range"},400);
  const periodDays=months*30,consent=months===1&&x.autoRenewConsent===true,e=env(),token=String(e.TELEGRAM_BOT_TOKEN??"").trim();if(!token)return json({error:"payments_not_configured"},503);
  const limiter=e.TELEGRAM_STARS_RATE_LIMITER as {limit?:(v:{key:string})=>Promise<{success:boolean}>}|undefined;if(!limiter||typeof limiter.limit!=="function")return json({error:"payment_rate_limit_unavailable"},503);
  try{if(!(await limiter.limit({key:"yubera-plus-invoice:"+user.telegram_user_id})).success)return json({error:"rate_limited"},429);}catch{return json({error:"payment_rate_limit_unavailable"},503);}
  const id=crypto.randomUUID(),payload="yubera_plus:"+periodDays+":"+id;
  try{await d.prepare("INSERT INTO yume_plus_payments(id,user_id,invoice_payload,amount,currency,status,auto_renew_consent,created_at) VALUES(?,?,?,?,'XTR','pending',?,CURRENT_TIMESTAMP)").bind(id,uid,payload,amount,consent?1:0).run();
   const invoice=await tg(token,"createInvoiceLink",{title:"YUBERA Plus",description:`Доступ к YUBERA Plus на ${periodDays} дней`,payload,provider_token:"",currency:"XTR",prices:[{label:`YUBERA Plus — ${periodDays} дней`,amount}],...(consent?{subscription_period:YUBERA_PLUS_PERIOD_SECONDS}:{})});
   if(!invoice.ok||typeof invoice.result!=="string"||!invoice.result.startsWith("https://t.me/")){await d.prepare("UPDATE yume_plus_payments SET status='failed' WHERE id=? AND status='pending'").bind(id).run();return json({error:"invoice_creation_failed"},502);}
   await d.prepare("UPDATE yume_plus_payments SET invoice_link=? WHERE id=? AND status='pending'").bind(invoice.result,id).run();return json({invoiceUrl:invoice.result,amount,periodDays,months,autoRenew:consent,discountPercent:months===3?17:0});
  }catch(error){console.error("[YUBERA][PLUS] Invoice creation failed.",error);return json({error:"payments_unavailable"},503);}
 }
 if(x.action==="cancel-auto-renew"||x.action==="enable-auto-renew"){
  if(!sub||sub.is_recurring!==1||!sub.telegram_payment_charge_id)return json({error:"recurring_subscription_not_available"},409);
  const enable=x.action==="enable-auto-renew";if((sub.auto_renew===1)===enable)return json({ok:true,autoRenew:enable,expiresAt:sub.expires_at});
  const token=String(env().TELEGRAM_BOT_TOKEN??"").trim();if(!token)return json({error:"payments_not_configured"},503);
  const result=await tg(token,"editUserStarSubscription",{user_id:Number(user.telegram_user_id),telegram_payment_charge_id:sub.telegram_payment_charge_id,is_canceled:!enable});
  if(!result.ok||result.result!==true)return json({error:"subscription_update_failed"},502);
  await d.prepare("UPDATE yume_plus_subscriptions SET auto_renew=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status='active' AND expires_at>?").bind(enable?1:0,sub.id,uid,Date.now()).run();return json({ok:true,autoRenew:enable,expiresAt:sub.expires_at});
 }
 return json({error:"invalid_action"},400);
}
async function isAdmin(r:Request,d:DB,e:E){const id=String(e.TELEGRAM_ADMIN_ID??""),secret=String(e.YUME_AUTH_SESSION_SECRET??""),token=cookie(r,COOKIE);if(!/^\d{1,20}$/.test(id)||secret.length<32||!token)return null;const h=await sign(token,secret);const row=await d.prepare("SELECT u.id,u.telegram_user_id,s.expires_at FROM yume_sessions s JOIN yume_users u ON u.id=s.user_id WHERE s.token_hash=? AND u.provider='telegram'").bind(h).first<{id:string;telegram_user_id:string;expires_at:number}>();return row&&row.expires_at>Date.now()&&row.telegram_user_id===id?row.id:null;}
export async function handleAdminYuberaPlus(r:Request):Promise<Response>{
 if(!["GET","POST"].includes(r.method))return json({error:"method_not_allowed"},405);if(r.method==="POST"&&!origin(r))return json({error:"cross_origin_request"},403);
 const d=db();if(!d)return json({error:"database_unavailable"},503);const e=env(),admin=await isAdmin(r,d,e);if(!admin)return json({isAdmin:false,error:"admin_required"},403);if(!isAdminPasswordConfigured(e))return json({isAdmin:false,error:"admin_password_not_configured"},503);if(!await hasAdminPasswordSession(r,e))return json({isAdmin:false,error:"admin_password_required"},428);
 if(r.method==="GET"){const [p,a]=await Promise.all([price(d),d.prepare("SELECT id,action,details_json,created_at FROM yume_plus_audit_log ORDER BY id DESC LIMIT 20").all<{id:number;action:string;details_json:string;created_at:string}>()]);return json({isAdmin:true,price:p,periodDays:30,periodSeconds:YUBERA_PLUS_PERIOD_SECONDS,audit:a.results});}
 let body:unknown;try{const raw=await r.text();if(raw.length>2048)return json({error:"request_too_large"},413);body=JSON.parse(raw);}catch{return json({error:"invalid_json"},400);}if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"invalid_request"},400);const input=body as Record<string,unknown>;
 if(input.action==="grant-by-username"){
  const username=normalizePlusGrantUsername(input.username),days=input.days===undefined?30:input.days;
  if(!username)return json({error:"invalid_username"},400);
  if(!isValidPlusGrantDays(days))return json({error:"invalid_duration",min:1,max:3650},400);
  const target=await d.prepare("SELECT id,telegram_username FROM yume_users WHERE provider='telegram' AND lower(telegram_username)=lower(?) LIMIT 1").bind(username).first<{id:string;telegram_username:string|null}>();
  if(!target)return json({error:"telegram_user_not_found"},404);
  const now=Date.now(),previous=await d.prepare("SELECT MAX(expires_at) AS expires_at FROM yume_plus_subscriptions WHERE user_id=? AND status='active' AND expires_at>?").bind(target.id,now).first<{expires_at:number|null}>();
  const startsAt=now,expiresAt=Math.max(now,Number(previous?.expires_at??now))+days*86400000,id=crypto.randomUUID();
  try{
   if(!d.batch)return json({error:"atomic_admin_batch_unavailable"},503);
   await d.batch([
    d.prepare("INSERT INTO yume_plus_subscriptions(id,user_id,status,starts_at,expires_at,auto_renew,telegram_payment_charge_id,created_at,updated_at,is_recurring,renewal_failed_at) VALUES(?,?,'active',?,?,0,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0,NULL)").bind(id,target.id,startsAt,expiresAt),
    d.prepare("INSERT INTO yume_plus_audit_log(actor_user_id,action,details_json,created_at) VALUES(?,'plus_granted_by_admin',?,CURRENT_TIMESTAMP)").bind(admin,JSON.stringify({username:target.telegram_username??username,userId:target.id,days,startsAt,expiresAt,previousExpiresAt:previous?.expires_at??null}))
   ]);
   return json({isAdmin:true,granted:true,username:target.telegram_username??username,days,startsAt,expiresAt,extended:Boolean(previous?.expires_at)});
  }catch(error){console.error("[YUBERA][PLUS] Admin grant failed.",error);return json({error:"plus_grant_failed"},503);}
 }
 const value=input.price;if(!isValidPlusPrice(value))return json({error:"invalid_price",min:1,max:10000},400);
 const old=await price(d);if(old===value)return json({isAdmin:true,price:value,unchanged:true});
 try{
  if(!d.batch)return json({error:"atomic_admin_batch_unavailable"},503);
  const results=await d.batch([
   d.prepare("UPDATE yume_plus_settings SET setting_value=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE setting_key='price_xtr' AND setting_value=?").bind(String(value),admin,String(old)),
   d.prepare("INSERT INTO yume_plus_audit_log(actor_user_id,action,details_json,created_at) SELECT ?,'plus_price_changed',?,CURRENT_TIMESTAMP WHERE changes()=1").bind(admin,JSON.stringify({oldPrice:old,newPrice:value}))
  ]);
  if(Number(results[0]?.meta?.changes??0)!==1)return json({error:"price_changed_concurrently",price:await price(d)},409);
  return json({isAdmin:true,price:value});
 }catch(error){console.error("[YUBERA][PLUS] Price update failed.",error);return json({error:"price_save_failed"},503);}
}
export async function recordYuberaPlusSuccessfulPayment(d:DB,telegramId:string,p:Pay):Promise<boolean>{
 const payload=p.invoice_payload??"";if(!payload.startsWith("yubera_plus:"))return false;const charge=p.telegram_payment_charge_id??"",amount=p.total_amount;if(!charge||!Number.isSafeInteger(amount)||amount!<1||p.currency!=="XTR")return true;
 const order=await d.prepare("SELECT id,user_id,amount,currency,status,auto_renew_consent,subscription_id,telegram_payment_charge_id FROM yume_plus_payments WHERE invoice_payload=?").bind(payload).first<{id:string;user_id:string;amount:number;currency:string;status:string;auto_renew_consent:number;subscription_id:string|null;telegram_payment_charge_id:string|null}>();if(!order||order.amount!==amount||order.currency!=="XTR")return true;
 const owner=await d.prepare("SELECT telegram_user_id FROM yume_users WHERE id=?").bind(order.user_id).first<{telegram_user_id:string}>();if(owner?.telegram_user_id!==telegramId)return true;
 const recurring=p.is_recurring===true,first=p.is_first_recurring===true,now=Date.now();
 if(order.status==="pre_checkout"&&!order.telegram_payment_charge_id){
  if((order.auto_renew_consent===1)!==recurring||(recurring&&!first))return true;
  if(!d.batch)throw new Error("atomic_payment_batch_unavailable");
  const subId=order.id,expiry=recurring?resolveInitialPlusExpiry(p.subscription_expiration_date,now):now+(payload.startsWith("yubera_plus:90:")?90:30)*86400000;
  const results=await d.batch([
   d.prepare("INSERT OR IGNORE INTO yume_plus_subscriptions(id,user_id,status,starts_at,expires_at,auto_renew,telegram_payment_charge_id,is_recurring,created_at,updated_at) VALUES(?,?,'active',?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").bind(subId,order.user_id,now,expiry,recurring?1:0,charge,recurring?1:0),
   d.prepare("UPDATE yume_plus_payments SET status='paid',subscription_id=?,telegram_payment_charge_id=?,paid_at=CURRENT_TIMESTAMP WHERE invoice_payload=? AND status='pre_checkout' AND telegram_payment_charge_id IS NULL").bind(subId,charge,payload),
   d.prepare("INSERT OR IGNORE INTO yume_plus_payment_events(telegram_payment_charge_id,user_id,invoice_payload,amount,currency,is_recurring,is_first_recurring,subscription_expiration_date,status,created_at) SELECT ?,?,?,?,'XTR',?,?,?,?,CURRENT_TIMESTAMP WHERE changes()=1").bind(charge,order.user_id,payload,amount,recurring?1:0,first?1:0,p.subscription_expiration_date??null,"paid")
  ]);
  if(Number(results[1]?.meta?.changes??0)!==1){
   const latest=await d.prepare("SELECT status,telegram_payment_charge_id FROM yume_plus_payments WHERE invoice_payload=?").bind(payload).first<{status:string;telegram_payment_charge_id:string|null}>();
   if(latest?.status!=="paid"||latest.telegram_payment_charge_id!==charge)throw new Error("plus_initial_payment_state_conflict");
  }
  return true;
 }
 if(order.status==="paid"&&order.subscription_id&&order.auto_renew_consent===1&&recurring&&!first){
  if(!d.batch)throw new Error("atomic_payment_batch_unavailable");
  const sec=p.subscription_expiration_date,expiry=typeof sec==="number"&&Number.isSafeInteger(sec)?sec*1000:0;
  await d.batch([
   d.prepare("INSERT OR IGNORE INTO yume_plus_payment_events(telegram_payment_charge_id,user_id,invoice_payload,amount,currency,is_recurring,is_first_recurring,subscription_expiration_date,status,created_at) SELECT ?,?,?,?,'XTR',1,0,?,'paid',CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM yume_plus_subscriptions WHERE id=? AND user_id=?)").bind(charge,order.user_id,payload,amount,sec??null,order.subscription_id,order.user_id),
   d.prepare("UPDATE yume_plus_subscriptions SET expires_at=CASE WHEN ?>0 THEN ? ELSE MAX(expires_at,?)+? END,status='active',auto_renew=1,renewal_failed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND changes()=1").bind(expiry,expiry,now,PERIOD,order.subscription_id,order.user_id)
  ]);
  return true;
 }
 return true;
}
export async function recordYuberaPlusSubscriptionUpdate(d:DB,u:SubUpdate){const id=u.user?.id,payload=u.invoice_payload??"";if(!Number.isSafeInteger(id)||!payload.startsWith("yubera_plus:"))return;const failed=u.state==="failed",value=u.state==="active"?1:u.state==="canceled"||failed?0:null;if(value===null)return;await d.prepare("UPDATE yume_plus_subscriptions SET auto_renew=?,renewal_failed_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT p.subscription_id FROM yume_plus_payments p JOIN yume_users u ON u.id=p.user_id WHERE p.invoice_payload=? AND u.telegram_user_id=?) AND status='active'").bind(value,failed?1:0,payload,String(id)).run();}
export async function recordTelegramStarsRefund(d:DB,telegramId:string,p:Refund,token?:string){
 const charge=p.telegram_payment_charge_id??"",amount=p.total_amount;
 if(!charge||!Number.isSafeInteger(amount)||amount!<1||p.currency!=="XTR")return;
 await d.prepare("INSERT OR IGNORE INTO yume_stars_refunds(telegram_payment_charge_id,telegram_user_id,amount,currency,refunded_at) SELECT telegram_payment_charge_id,telegram_user_id,amount,currency,CURRENT_TIMESTAMP FROM yume_stars_donations WHERE telegram_payment_charge_id=? AND telegram_user_id=? AND amount=? AND currency='XTR' AND status='paid'").bind(charge,telegramId,amount).run();
 const x=await d.prepare("SELECT e.invoice_payload,p.user_id,p.subscription_id,p.telegram_payment_charge_id AS initial_charge,s.is_recurring,u.telegram_user_id FROM yume_plus_payment_events e JOIN yume_plus_payments p ON p.invoice_payload=e.invoice_payload JOIN yume_plus_subscriptions s ON s.id=p.subscription_id JOIN yume_users u ON u.id=p.user_id WHERE e.telegram_payment_charge_id=? AND e.amount=? AND e.currency='XTR' AND e.status='paid'").bind(charge,amount).first<{invoice_payload:string;user_id:string;subscription_id:string|null;initial_charge:string|null;is_recurring:number;telegram_user_id:string}>();
 if(!x||x.telegram_user_id!==telegramId||!x.subscription_id)return;
 if(!d.batch)throw new Error("atomic_refund_batch_unavailable");
 if(x.is_recurring===1&&x.initial_charge){
  if(!token)throw new Error("telegram_bot_token_missing_for_refund_cancellation");
  const result=await tg(token,"editUserStarSubscription",{user_id:Number(telegramId),telegram_payment_charge_id:x.initial_charge,is_canceled:true});
  if(!result.ok&&!/not found|already canceled|already cancelled/i.test(result.description??""))throw new Error("telegram_subscription_cancel_failed");
 }
 const statements=[
  d.prepare("UPDATE yume_plus_payment_events SET status='refunded',refunded_at=CURRENT_TIMESTAMP WHERE telegram_payment_charge_id=? AND status='paid'").bind(charge),
  ...(x.initial_charge===charge?[d.prepare("UPDATE yume_plus_payments SET status='refunded' WHERE invoice_payload=? AND telegram_payment_charge_id=?").bind(x.invoice_payload,charge)]:[]),
  d.prepare("UPDATE yume_plus_subscriptions SET status='cancelled',auto_renew=0,expires_at=MIN(expires_at,?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(Date.now(),x.subscription_id,x.user_id),
 ];
 await d.batch(statements);
}
