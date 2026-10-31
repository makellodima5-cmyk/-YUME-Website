import { DurableObject } from "cloudflare:workers";
import { applyCatalogMutation, CATALOG_CURRENT_KEY, CATALOG_REVISION_PREFIX, emptyCatalogState, type CatalogMutation, type CatalogPointer, type CatalogState } from "@/data/catalog-r2.shared";

type CoordinatorEnv = { CATALOG_BUCKET:R2Bucket; YUME_DB:D1Database };
type Env = { CATALOG_COORDINATOR:DurableObjectNamespace<CatalogCoordinator> };
type Operation = { id:string; mutation:CatalogMutation; acceptedAt:string; sequence:number; status:"pending"|"committed"; revision?:number };

function validMutation(value:unknown):value is CatalogMutation {
  if(!value||typeof value!=="object")return false;
  const mutation=value as Record<string,unknown>;
  if(mutation.type==="upsert"||mutation.type==="replace")return Array.isArray(mutation.items)&&mutation.items.length<=100&&mutation.items.every(item=>Boolean(item)&&typeof item==="object"&&/^\d{1,20}$/.test(item.id)&&typeof item.title==="string"&&item.title.length<=500);
  if(mutation.type==="delete"||mutation.type==="restore")return Array.isArray(mutation.animeIds)&&mutation.animeIds.length<=500&&mutation.animeIds.every(id=>typeof id==="string"&&/^\d{1,20}$/.test(id))&&(!("titles" in mutation)||Boolean(mutation.titles)&&Object.entries(mutation.titles??{}).every(([id,title])=>/^\d{1,20}$/.test(id)&&typeof title==="string"&&title.length<=500));
  if(mutation.type==="metadata")return !!mutation.values&&typeof mutation.values==="object"&&!Array.isArray(mutation.values)&&Object.entries(mutation.values).length<=100&&Object.entries(mutation.values).every(([key,value])=>/^[A-Za-z0-9:_-]{1,200}$/.test(key)&&typeof value==="string"&&value.length<=256000)&&(!mutation.deleteKeys||(Array.isArray(mutation.deleteKeys)&&mutation.deleteKeys.length<=100&&mutation.deleteKeys.every(key=>typeof key==="string"&&/^[A-Za-z0-9:_-]{1,200}$/.test(key))));
  if(mutation.type==="screenshots")return typeof mutation.animeId==="string"&&/^\d{1,20}$/.test(mutation.animeId)&&Array.isArray(mutation.items)&&mutation.items.length<=100&&mutation.items.every(item=>{try{return Number.isSafeInteger(item.position)&&[item.originalUrl,item.previewUrl].every(value=>{const url=new URL(value);return (url.protocol==="https:"||url.protocol==="http:")&&value.length<=2048;});}catch{return false;}});
  if(mutation.type==="batch")return Array.isArray(mutation.mutations)&&mutation.mutations.length>0&&mutation.mutations.length<=100&&mutation.mutations.every(validMutation)&&!mutation.mutations.some(item=>item.type==="batch");
  return false;
}
async function sha256(value:string):Promise<string>{const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");}

export class CatalogCoordinator extends DurableObject<CoordinatorEnv>{
  constructor(ctx:DurableObjectState,env:CoordinatorEnv){super(ctx,env);}

  async fetch(request:Request):Promise<Response>{
    if(request.method!=="POST")return Response.json({error:"method_not_allowed"},{status:405});
    let input:{operationId?:string;mutation?:unknown};
    try{input=await request.json() as typeof input;}catch{return Response.json({error:"invalid_json"},{status:400});}
    if(!input.operationId||!/^[A-Za-z0-9_-]{12,80}$/.test(input.operationId)||!validMutation(input.mutation))return Response.json({error:"invalid_catalog_mutation"},{status:400});
    return this.ctx.blockConcurrencyWhile(async()=>{
      const key="operation:"+input.operationId;
      const existing=await this.ctx.storage.get<Operation>(key);
      if(existing&&JSON.stringify(existing.mutation)!==JSON.stringify(input.mutation))return Response.json({error:"operation_id_reused"},{status:409});
      if(existing?.status==="committed")return Response.json({ok:true,revision:existing.revision,duplicate:true});
      // Arm recovery before persisting or executing a command; an empty alarm is harmless.
      await this.ctx.storage.setAlarm(Date.now()+60000);
      let operation:Operation;
      if(existing) operation=existing;
      else {
        operation=await this.ctx.storage.transaction(async(transaction)=>{
          const sequence=(await transaction.get<number>("catalog:next-sequence")??0)+1;
          const created:Operation={id:input.operationId!,mutation:input.mutation!,acceptedAt:new Date().toISOString(),sequence,status:"pending"};
          await transaction.put("catalog:next-sequence",sequence);
          await transaction.put(key,created);
          return created;
        });
      }
      try{
        const completed=await this.processPending();
        const result=completed.find(item=>item.id===operation.id);
        if(result?.status==="committed")return Response.json({ok:true,revision:result.revision,duplicate:Boolean(existing)});
        await this.ctx.storage.setAlarm(Date.now()+15000);
        return Response.json({error:"catalog_mutation_pending",operationId:operation.id},{status:503});
      }catch(error){
        console.error("[YUME][CATALOG_COORDINATOR] Mutation remains pending.",{operationId:operation.id,error});
        await this.ctx.storage.setAlarm(Date.now()+15000);
        return Response.json({error:"catalog_mutation_pending",operationId:operation.id},{status:503});
      }
    });
  }

  private async processPending():Promise<Operation[]>{
    const entries=await this.ctx.storage.list<Operation>({prefix:"operation:"});
    const pending=[...entries.entries()].filter(([,value])=>value.status==="pending").sort((a,b)=>a[1].sequence-b[1].sequence);
    const completed:Operation[]=[];
    for(const [key,operation] of pending){
      try{
        const revision=await this.commit(operation);
        const saved:Operation={...operation,status:"committed",revision};
        await this.ctx.storage.put(key,saved);
        await this.pruneOperationHistory(saved.sequence);
        completed.push(saved);
      }catch(error){
        console.warn("[YUME][CATALOG_COORDINATOR] Pending operation will be retried.",{operationId:operation.id,error});
        break;
      }
    }
    return completed;
  }

  private async commit(operation:Operation):Promise<number>{
    const pointerObject=await this.env.CATALOG_BUCKET.get(CATALOG_CURRENT_KEY);
    const pointer=pointerObject?await pointerObject.json<CatalogPointer>():null;
    if(pointer){
      if(pointer.schemaVersion!==1||pointer.key!==CATALOG_REVISION_PREFIX+pointer.revision+".json")throw new Error("Invalid current catalogue pointer.");
      if(pointer.operationId===operation.id){
        await this.appendJournal(operation,pointer.revision);
        await this.pruneOldRevision(pointer.revision);
        return pointer.revision;
      }
    }
    let state:CatalogState;
    if(pointer){
      const object=await this.env.CATALOG_BUCKET.get(pointer.key);
      if(!object)throw new Error("Current catalogue revision is missing.");
      const body=await object.text();
      if(await sha256(body)!==pointer.checksum)throw new Error("Current catalogue revision checksum mismatch.");
      state=JSON.parse(body) as CatalogState;
      if(state.schemaVersion!==1||state.revision!==pointer.revision||!Array.isArray(state.items))throw new Error("Current catalogue revision is invalid.");
    }else state=emptyCatalogState();

    const next=applyCatalogMutation(state,operation.mutation);
    next.revision=state.revision+1;
    const body=JSON.stringify(next);
    const checksum=await sha256(body);
    const key=CATALOG_REVISION_PREFIX+next.revision+".json";
    await this.env.CATALOG_BUCKET.put(key,body,{httpMetadata:{contentType:"application/json",cacheControl:"private, max-age=31536000, immutable"},customMetadata:{checksum,operationId:operation.id}});
    const nextPointer:CatalogPointer={schemaVersion:1,revision:next.revision,key,operationId:operation.id,checksum,updatedAt:next.updatedAt};
    const committed=await this.env.CATALOG_BUCKET.put(CATALOG_CURRENT_KEY,JSON.stringify(nextPointer),{
      httpMetadata:{contentType:"application/json",cacheControl:"no-store"},
      onlyIf:pointerObject?{etagMatches:pointerObject.etag}:{etagDoesNotMatch:"*"},
    });
    if(!committed)throw new Error("catalog_pointer_conflict");
    await this.appendJournal(operation,next.revision);
    await this.pruneOldRevision(next.revision);
    return next.revision;
  }

  private async pruneOldRevision(revision:number):Promise<void>{
    const obsolete=revision-10;
    if(obsolete<1)return;
    try{await this.env.CATALOG_BUCKET.delete(CATALOG_REVISION_PREFIX+obsolete+".json");}
    catch(error){console.warn("[YUME][CATALOG_COORDINATOR] Old revision cleanup failed.",{revision:obsolete,error});}
  }

  private async pruneOperationHistory(sequence:number):Promise<void>{
    const cutoff=sequence-1000;
    if(cutoff<=0)return;
    const entries=await this.ctx.storage.list<Operation>({prefix:"operation:"});
    const obsolete=[...entries.entries()].filter(([,operation])=>operation.status==="committed"&&operation.sequence<cutoff).map(([key])=>key);
    if(obsolete.length)await this.ctx.storage.delete(obsolete);
  }

  private async appendJournal(operation:Operation,revision:number):Promise<void>{
    const mutationJson=JSON.stringify(operation.mutation);
    const digest=await sha256(mutationJson);
    const summary=(value:CatalogMutation):{types:string[];ids:string[];count:number;metadataKeys:string[]}=>{
      if(value.type==="batch"){
        const parts=value.mutations.map(summary);
        return {types:parts.flatMap(part=>part.types),ids:[...new Set(parts.flatMap(part=>part.ids))].slice(0,500),count:parts.reduce((sum,part)=>sum+part.count,0),metadataKeys:[...new Set(parts.flatMap(part=>part.metadataKeys))].slice(0,100)};
      }
      if(value.type==="upsert"||value.type==="replace")return {types:[value.type],ids:value.items.map(item=>item.id).slice(0,500),count:value.items.length,metadataKeys:[]};
      if(value.type==="delete"||value.type==="restore")return {types:[value.type],ids:value.animeIds.slice(0,500),count:value.animeIds.length,metadataKeys:[]};
      if(value.type==="screenshots")return {types:[value.type],ids:[value.animeId],count:value.items.length,metadataKeys:[]};
      return {types:[value.type],ids:[],count:0,metadataKeys:[...Object.keys(value.values),...(value.deleteKeys??[])].slice(0,100)};
    };
    const details=summary(operation.mutation);
    const payload=JSON.stringify({operationId:operation.id,mutationTypes:details.types,animeIds:details.ids,changedCount:details.count,metadataKeys:details.metadataKeys,payloadSha256:digest,payloadBytes:new TextEncoder().encode(mutationJson).byteLength,acceptedAt:operation.acceptedAt,revision});
    const result=await this.env.YUME_DB.prepare("INSERT INTO yume_catalog_write_journal (operation_id,event_type,payload,created_at) VALUES (?,?,?,CURRENT_TIMESTAMP)")
      .bind(operation.id,"committed:"+operation.mutation.type,payload).run();
    const rowsRead=Number(result.meta?.rows_read??0);
    const rowsWritten=Number(result.meta?.rows_written??0);
    console.info("[YUME][CATALOG_JOURNAL_METRICS]",{rowsRead,rowsWritten,payloadBytes:new TextEncoder().encode(payload).byteLength});
    if(rowsRead>0)console.warn("[YUME][CATALOG_JOURNAL_METRICS] D1 reported rows_read for an append-only catalogue journal INSERT.",{rowsRead});
  }

  async alarm():Promise<void>{
    await this.ctx.blockConcurrencyWhile(async()=>{
      try{
        const entries=await this.ctx.storage.list<Operation>({prefix:"operation:"});
        if(![...entries.values()].some(value=>value.status==="pending"))return;
        await this.processPending();
        const remaining=await this.ctx.storage.list<Operation>({prefix:"operation:"});
        if([...remaining.values()].some(value=>value.status==="pending"))await this.ctx.storage.setAlarm(Date.now()+60000);
      }catch(error){
        console.error("[YUME][CATALOG_COORDINATOR] Alarm retry failed.",error);
        await this.ctx.storage.setAlarm(Date.now()+60000);
      }
    });
  }
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    if(request.method!=="POST"||new URL(request.url).pathname!=="/internal/v1/mutate")return new Response("Not Found",{status:404});
    return env.CATALOG_COORDINATOR.getByName("yume-catalog").fetch(request);
  },
} satisfies ExportedHandler<Env>;
