import { describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { runScheduledEpisodeNotifications, storedStatus } from "@/data/episode-notifications-cron.server";

describe("scheduled episode notification status mapping", () => {
  it.each([["ongoing","Неизвестно","Онгоинг"],["anons","Неизвестно","Анонс"],["released","Онгоинг","Вышел"]])("maps Shikimori status %s", (source,fallback,expected) => {
    expect(storedStatus(source,fallback)).toBe(expected);
  });
  it("preserves a valid stored status when Shikimori returns an unknown status", () => {
    expect(storedStatus("unexpected","Онгоинг")).toBe("Онгоинг");
  });
  it("normalizes an invalid fallback instead of persisting arbitrary values", () => {
    expect(storedStatus(null,"unexpected" as never)).toBe("Неизвестно");
  });
});

describe("scheduled episode notification durability with R2 catalogue state", () => {
  const state = {
    schemaVersion:1, revision:7, updatedAt:"2026-10-31T00:00:00.000Z", exclusions:{}, metadata:{},
    items:[{id:"123",title:"Старое название",original:"Anime",year:2020,episodes:12,episodesAired:5,rating:8,genres:[],status:"Онгоинг",description:"",hue:10,glyph:"A",nextEpisodeAt:"2026-10-30T10:00:00+00:00"}],
  };
  function setup(events:string[]) {
    const bindings=env as unknown as Record<string,unknown>;
    const previous={reader:bindings.YUME_CATALOG_READER,coordinator:bindings.YUME_CATALOG_COORDINATOR,token:bindings.YUME_CATALOG_READER_TOKEN};
    bindings.YUME_CATALOG_READER={fetch:async (_url:RequestInfo|URL,init?:RequestInit)=>{events.push("read-r2-catalog");expect(new Headers(init?.headers).get("X-Yume-Reader-Token")).toBe("token");return Response.json(state);}};
    bindings.YUME_CATALOG_COORDINATOR={fetch:async (_url:RequestInfo|URL,init?:RequestInit)=>{events.push("publish-r2");const body=JSON.parse(String(init?.body));expect(body.mutation).toBeTruthy();return Response.json({ok:true,revision:8});}};
    bindings.YUME_CATALOG_READER_TOKEN="token";
    const db={prepare(sql:string){return{bind(){return this;},async first(){if(sql.includes("yume_anime_subscriptions")){events.push("read-subscribers");return{found:1};}return null;},async run(){events.push("deactivate-subscriptions");return{meta:{changes:0}};}};}};
    return {db,restore:()=>{bindings.YUME_CATALOG_READER=previous.reader;bindings.YUME_CATALOG_COORDINATOR=previous.coordinator;bindings.YUME_CATALOG_READER_TOKEN=previous.token;}};
  }
  function stubShikimori(){vi.stubGlobal("fetch",vi.fn(async()=>Response.json({data:{animes:[{id:"123",name:"Anime",russian:"Аниме",status:"ongoing",episodes:12,episodesAired:6,nextEpisodeAt:"2026-11-06T10:00:00+00:00"}]}})));}
  it("does not publish catalogue state when Queue delivery fails",async()=>{
    const events:string[]=[];const {db,restore}=setup(events);stubShikimori();
    try{
      await expect(runScheduledEpisodeNotifications({YUME_DB:db,YUME_WEB_TASKS:{async send(){events.push("send-queue-job");throw new Error("temporary Queue failure");}}})).rejects.toThrow("temporary Queue failure");
      expect(events).toEqual(["read-r2-catalog","read-subscribers","send-queue-job"]);
    }finally{restore();vi.unstubAllGlobals();}
  });
  it("sends the Queue job before publishing the updated R2 catalogue",async()=>{
    const events:string[]=[];const {db,restore}=setup(events);stubShikimori();
    try{
      await runScheduledEpisodeNotifications({YUME_DB:db,YUME_WEB_TASKS:{async send(){events.push("send-queue-job");}}});
      expect(events.indexOf("send-queue-job")).toBeLessThan(events.indexOf("publish-r2"));
      expect(events.filter(x=>x==="publish-r2")).toHaveLength(1);
    }finally{restore();vi.unstubAllGlobals();}
  });
});
