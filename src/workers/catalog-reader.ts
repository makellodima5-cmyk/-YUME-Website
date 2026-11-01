import { CATALOG_CURRENT_KEY, CATALOG_REVISION_PREFIX, emptyCatalogState, type CatalogPointer, type CatalogState } from "@/data/catalog-r2.shared";

type Env = {
  R2_ACCOUNT_ID:string;
  R2_ACCESS_KEY_ID:string;
  R2_SECRET_ACCESS_KEY:string;
  CATALOG_READER_TOKEN:string;
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
  return fetch(url,{method:"GET",headers:{Authorization:authorization,"x-amz-content-sha256":payloadHash,"x-amz-date":amzDate,"x-amz-security-token":credentials.sessionToken}});
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
async function readObjectText(env:Env,key:string):Promise<string|null>{
  const response=await signedGet(env,key);
  if(response.status===404)return null;
  if(!response.ok)throw new Error("R2 read failed with HTTP "+response.status);
  return response.text();
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
      const pointer=await readObject<CatalogPointer>(env,CATALOG_CURRENT_KEY);
      if(!pointer){const state=emptyCatalogState();return request.method==="HEAD"?new Response(null,{status:200}):json(state);}
      if(pointer.schemaVersion!==1||!Number.isSafeInteger(pointer.revision)||pointer.key!==CATALOG_REVISION_PREFIX+pointer.revision+".json")return json({error:"invalid_catalog_pointer"},503);
      let state=cachedRevision===pointer.revision?cachedState:null;
      if(!state){
        const body=await readObjectText(env,pointer.key);
        if(body===null||hex(await sha256(body))!==pointer.checksum)return json({error:"catalog_revision_checksum_mismatch"},503);
        state=JSON.parse(body) as CatalogState;
        if(!state||state.schemaVersion!==1||state.revision!==pointer.revision||!Array.isArray(state.items))return json({error:"invalid_catalog_revision"},503);
        cachedRevision=pointer.revision;cachedState=state;
      }
      return request.method==="HEAD"?new Response(null,{status:200,headers:{"X-Yume-Catalog-Revision":String(pointer.revision)}}):json(state,200,{"X-Yume-Catalog-Revision":String(pointer.revision)});
    }catch(error){console.error("[YUME][CATALOG_READER] Failed to read R2 catalogue.",error);return json({error:"catalog_unavailable"},503);}
  },
} satisfies ExportedHandler<Env>;
