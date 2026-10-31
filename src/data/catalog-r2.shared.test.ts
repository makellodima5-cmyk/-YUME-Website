import { describe, expect, it } from "vitest";
import { applyCatalogMutation, emptyCatalogState } from "@/data/catalog-r2.shared";
import type { Anime } from "@/data/anime";

const anime=(id:string,title="Title"):Anime=>({id,title,original:title,year:2024,episodes:12,episodesAired:0,rating:8,genres:["Драма"],status:"Онгоинг",description:"",hue:120,glyph:"A"});

describe("R2 catalogue state mutations",()=>{
  it("upserts by Shikimori ID without duplicating catalogue rows",()=>{
    const state=applyCatalogMutation(emptyCatalogState(),{type:"upsert",items:[anime("1"),anime("2")]});
    const next=applyCatalogMutation(state,{type:"upsert",items:[anime("1","Updated")]});
    expect(next.items).toHaveLength(2);
    expect(next.items.find(item=>item.id==="1")?.title).toBe("Updated");
  });
  it("records exclusions on delete and clears them on restore/upsert",()=>{
    const initial=applyCatalogMutation(emptyCatalogState(),{type:"upsert",items:[anime("42","Example")]});
    const deleted=applyCatalogMutation(initial,{type:"delete",animeIds:["42"]});
    expect(deleted.items).toHaveLength(0);
    expect(deleted.exclusions["42"]?.title).toBe("Example");
    const restored=applyCatalogMutation(deleted,{type:"restore",animeIds:["42"]});
    expect(restored.exclusions["42"]).toBeUndefined();
    const reimported=applyCatalogMutation(deleted,{type:"upsert",items:[anime("42")]});
    expect(reimported.exclusions["42"]).toBeUndefined();
  });
  it("applies a page, screenshots and progress metadata as one revision mutation",()=>{
    const batch=applyCatalogMutation(emptyCatalogState(),{type:"batch",mutations:[
      {type:"upsert",items:[anime("7")]},
      {type:"screenshots",animeId:"7",items:[{originalUrl:"https://cdn.example/frame.jpg",previewUrl:"https://cdn.example/preview.jpg",position:0}]},
      {type:"metadata",values:{admin_import_cursor:"2",admin_import_added:"1"}},
    ]});
    expect(batch.items).toHaveLength(1);
    expect(batch.screenshots["7"]).toHaveLength(1);
    expect(batch.metadata).toMatchObject({admin_import_cursor:"2",admin_import_added:"1"});
  });
});
