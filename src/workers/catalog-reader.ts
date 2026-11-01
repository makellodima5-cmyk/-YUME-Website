import { CATALOG_CURRENT_KEY, CATALOG_REVISION_PREFIX, emptyCatalogState, type CatalogPointer, type CatalogState } from "@/data/catalog-r2.shared";
import { readCatalogCachePointer, readCatalogSnapshotCache, writeCatalogSnapshotCache } from "@/data/catalog-kv-cache.shared";

type Env = {
  R2_ACCOUNT_ID:string;
  R2_ACCESS_KEY_ID:string;
  R2_SECRET_ACCESS_KEY:string;
  CATALOG_READER_TOKEN:string;
  YUME_CATALOG_CACHE:KVNamespace;
};
type TemporaryCredentials={accessKeyId:string;secretAccessKey:string;sessionToken:string;expiresAt:number};
const encoder=new TextEncoder();
let cachedCredentials:TemporaryCredentials|null=null;
let cachedRevision:number|null=null;
let cachedState:CatalogState|null=null;
function hex(value:ArrayBuffer):string{return [...new Uint8Array(value)].map(byte=>byte.toString(16).padStart(2,"0")).join("");}
async function sha256(value:string|ArrayBuffer):Promise<ArrayBuffer>{return crypto.subtle.digest("SHA-256",typeof value==="string"?encoder.encode(value):value);}
async function hmac(key:ArrayBuffer|string,value:string):Promise<ArrayBuffer>{
  const raw=typeof key==="string"?encoder.encode(key):key;
  const cryptoKey=await crypto.subtle.importKey("raw",raw,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return crypto.subtle.sign("HMAC",cryptoKey,encoder.encode(value));
}
function base64Url(bytes:Uint8Array):string{
  let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
async function createTemporaryCredentials(env:Env):Promise<TemporaryCredentials>{
  if(cachedCredentials&&cachedCredentials.expiresAt>Date.now()+60000)return cachedCredentials;
  const host=env.R2_ACCOUNT_ID+".r2.cloudflarestorage.com";
  const now=Math.floor(Date.now()/1000);
  const header=base64Url(encoder.encode(JSON.stringify({alg:"HS256",typ:"JWT"})));
  const payload=base64Url(encoder.encode(JSON.stringify({
    bucket:"yume-catalog",
    actions:["GetObject","HeadObject"],
    paths:{prefixPaths:["catalog/v1/"]},
    sub:env.R2_ACCOUNT_ID,
    iss:env.R2_ACCESS_KEY_ID,
    aud:host,
    iat:now,
    exp:now+900,
  })));
  const unsigned=header+"."+payload;
  const signature=base64Url(new Uint8Array(await hmac(env.R2_SECRET_ACCESS_KEY,unsigned)));
  const jwt=unsigned+"."+signature;
  const derived=await sha256(jwt);
  cachedCredentials={
    accessKeyId:env.R2_ACCESS_KEY_ID,
    secretAccessKey:hex(derived),
    sessionToken:btoa("jwt/"+jwt),
    expiresAt:(now+900)*1000,
  };
  return cachedCredentials;
}
function encodePath(value:string):string{
  return value.split("/").map(part=>encodeURIComponent(part).replace(/[!'()*]/g,char=>"%"+char.charCodeAt(0).toString(16).toUpperCase())).join("/");
}
async function signedGet(env:Env,key:string):Promise<Response>{
  const credentials=await createTemporaryCredentials(env);
  const host=env.R2_ACCOUNT_ID+".r2.cloudflarestorage.com";
  const path="/"+encodePath("yume-catalog/"+key);
  const url="https://"+host+path;
  const now=new Date();
  const amzDate=now.toISOString().replace(/[:-]|\.\d{3}/g,"");
  const date=amzDate.slice(0,8);
  const scope=date+"/auto/s3/aws4_request";
  const payloadHash=hex(await sha256(""));
  const canonicalHeaders="host:"+host+"\n"+"x-amz-content-sha256:"+payloadHash+"\n"+"x-amz-date:"+amzDate+"\n"+"x-amz-security-token:"+credentials.sessionToken+"\n";
  const signedHeaders="host;x-amz-content-sha256;x-amz-date;x-amz-security-token";
  const canonicalRequest=["GET",path,"",canonicalHeaders,signedHeaders,payloadHash].join("\n");
  const stringToSign=["AWS4-HMAC-SHA256",amzDate,scope,hex(await sha256(canonicalRequest))].join("\n");
  const kDate=await hmac("AWS4"+credentials.secretAccessKey,date);
  const kRegion=await hmac(kDate,"auto");
  const kService=await hmac(kRegion,"s3");
  const kSigning=await hmac(kService,"aws4_request");
  const signature=hex(await hmac(kSigning,stringToSign));
  const authorization="AWS4-HMAC-SHA256 Credential="+credentials.accessKeyId+"/"+scope+", SignedHeaders="+signedHeaders+", Signature="+signature;
  return fetch(url,{method:"GET",headers:{Authorization:authorization,"x-amz-content-sha256":payloadHash,"x-amz-date":amzDate,"x-amz-security-token":credentials.sessionToken},signal:AbortSignal.timeout(8000)});
}
function json(data:unknown,status=200,headers?:HeadersInit):Response{
  return Response.json(data,{status,headers:{"Cache-Control":"private, no-store",...Object.fromEntries(new Headers(headers))}});
}
function validToken(supplied:string,expected:string):boolean{
  if(!expected||supplied.length!==expected.length)return false;
  const a=encoder.encode(supplied),b=encoder.encode(expected);let mismatch=0;
  for(let i=0;i<a.length;i++)mismatch|=a[i]!^b[i]!;
  return mismatch===0;
}
function safeR2Body(value:string):string {
  return value.slice(0,2048)
    .replace(/(authorization|x-amz-security-token|secretaccesskey|accesskeyid|token)\s*[:=]\s*[^\s<"]+/gi,"$1=[REDACTED]")
    .replace(/Bearer\s+[^\s<"]+/gi,"Bearer [REDACTED]");
}
async function readObjectText(env:Env,key:string):Promise<string|null>{
  const retryableStatuses=new Set([429,500,502,503,504]);
  let lastError:unknown;
  for(let attempt=0;attempt<3;attempt++){
    const startedAt=Date.now();
    try{
      const response=await signedGet(env,key);
      if(response.status===404)return null;
      if(response.ok)return await response.text();
      const body=safeR2Body(await response.text().catch(()=> ""));
      const code=/<Code>([^<]{1,120})<\/Code>/i.exec(body)?.[1]??null;
      const requestId=/<RequestId>([^<]{1,160})<\/RequestId>/i.exec(body)?.[1]??response.headers.get("x-amz-request-id");
      console.error("[YUME][CATALOG_READER] R2 upstream rejected object read.",{
        resource:key,status:response.status,code,requestId,attempt:attempt+1,
        durationMs:Date.now()-startedAt,body:body||null,
      });
      lastError=new Error("R2 read failed with HTTP "+response.status+(code?" ("+code+")":""));
      if(!retryableStatuses.has(response.status)||attempt===2)break;
      const retryAfter=Number(response.headers.get("retry-after"));
      await new Promise(resolve=>setTimeout(resolve,Number.isFinite(retryAfter)&&retryAfter>0?Math.min(5000,retryAfter*1000):250*Math.pow(2,attempt)));
    }catch(error){
      lastError=error;
      console.error("[YUME][CATALOG_READER] R2 object read threw.",{
        resource:key,attempt:attempt+1,durationMs:Date.now()-startedAt,
        errorName:error instanceof Error?error.name:"UnknownError",
        errorMessage:error instanceof Error?error.message:"Unknown R2 read error",
      });
      const retryable=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError"||error instanceof TypeError);
      if(!retryable||attempt===2)break;
      await new Promise(resolve=>setTimeout(resolve,250*Math.pow(2,attempt)));
    }
  }
  throw lastError instanceof Error?lastError:new Error("R2 object read failed.");
}
async function readObject<T>(env:Env,key:string):Promise<T|null>{
  const body=await readObjectText(env,key);
  return body===null?null:JSON.parse(body) as T;
}
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    if(request.method!=="GET"&&request.method!=="HEAD")return json({error:"method_not_allowed"},405,{Allow:"GET, HEAD"});
    if(!validToken(request.headers.get("X-Yume-Reader-Token")??"",env.CATALOG_READER_TOKEN??""))return json({error:"unauthorized"},401);
    if(new URL(request.url).pathname!=="/v1/state")return json({error:"not_found"},404);
    try{
      const fresh=new URL(request.url).searchParams.get("fresh")==="1";
      const cachePointer=fresh?null:await readCatalogCachePointer(env.YUME_CATALOG_CACHE);
      let pointer:CatalogPointer|null=cachePointer
        ? {schemaVersion:1,revision:cachePointer.revision,key:CATALOG_REVISION_PREFIX+cachePointer.revision+".json",operationId:"shared-cache",checksum:"",updatedAt:cachePointer.updatedAt}
        : await readObject<CatalogPointer>(env,CATALOG_CURRENT_KEY);
      if(!pointer){const state=emptyCatalogState();return request.method==="HEAD"?new Response(null,{status:200}):json(state);}
      if(pointer.schemaVersion!==1||!Number.isSafeInteger(pointer.revision)||pointer.key!==CATALOG_REVISION_PREFIX+pointer.revision+".json")return json({error:"invalid_catalog_pointer"},503);
      let state=fresh?null:cachedRevision===pointer.revision?cachedState:null;
      if(!fresh&&!state)state=await readCatalogSnapshotCache(env.YUME_CATALOG_CACHE,pointer.revision);
      if(!state){
        // KV is eventually consistent. On a cold/missing cache, resolve the authoritative
        // R2 pointer before loading data so a stale KV pointer cannot poison the cache.
        if(cachePointer&&!fresh){
          pointer=await readObject<CatalogPointer>(env,CATALOG_CURRENT_KEY);
          if(!pointer||pointer.schemaVersion!==1||!Number.isSafeInteger(pointer.revision)||pointer.key!==CATALOG_REVISION_PREFIX+pointer.revision+".json")return json({error:"invalid_catalog_pointer"},503);
          state=cachedRevision===pointer.revision?cachedState:await readCatalogSnapshotCache(env.YUME_CATALOG_CACHE,pointer.revision);
        }
        if(!state){
          const body=await readObjectText(env,pointer.key);
          if(body===null||hex(await sha256(body))!==pointer.checksum)return json({error:"catalog_revision_checksum_mismatch"},503);
          state=JSON.parse(body) as CatalogState;
          if(!state||state.schemaVersion!==1||state.revision!==pointer.revision||!Array.isArray(state.items))return json({error:"invalid_catalog_revision"},503);
          try{if(!fresh)await writeCatalogSnapshotCache(env.YUME_CATALOG_CACHE,state,false);}
          catch(error){console.warn("[YUME][CATALOG_READER] Shared cache repair failed.",error);}
        }
      }
      if(!fresh){cachedRevision=pointer.revision;cachedState=state;}
      return request.method==="HEAD"?new Response(null,{status:200,headers:{"X-Yume-Catalog-Revision":String(pointer.revision)}}):json(state,200,{"X-Yume-Catalog-Revision":String(pointer.revision)});
    }catch(error){console.error("[YUME][CATALOG_READER] Failed to read R2 catalogue.",error);return json({error:"catalog_unavailable"},503);}
  },
} satisfies ExportedHandler<Env>;
