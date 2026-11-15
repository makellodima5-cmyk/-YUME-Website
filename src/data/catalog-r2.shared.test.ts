import { describe, expect, it } from "vitest";
import { applyCatalogMutation, emptyCatalogState, isCatalogRevisionPinned, isValidCatalogId } from "@/data/catalog-r2.shared";
import type { Anime } from "@/data/anime";

const anime=(id:string,title="Title"):Anime=>({id,title,original:title,year:2024,episodes:12,episodesAired:0,rating:8,genres:["Драма"],status:"Онгоинг",description:"",hue:120,glyph:"A"});

describe("catalogue identity validation",()=>{
  it("accepts numeric provider IDs and namespaced World Art Cinema IDs",()=>{
    expect(isValidCatalogId("73880")).toBe(true);
    expect(isValidCatalogId("wa-cinema-73880")).toBe(true);
    expect(isValidCatalogId("wa-animation-73880")).toBe(false);
    expect(isValidCatalogId("wa-cinema-")).toBe(false);
    expect(isValidCatalogId("wa-cinema-73880/other")).toBe(false);
    expect(isValidCatalogId(73880)).toBe(false);
  });
});

describe("R2 catalogue state mutations",()=>{
  it("upserts a World Art Cinema record with a namespaced ID",()=>{
    const record={...anime("wa-cinema-73880","Кастлвания"),catalogSource:"kodik" as const,worldArtId:"73880",worldArtType:"cinema" as const,kodikId:"serial-4241"};
    const state=applyCatalogMutation(emptyCatalogState(),{type:"upsert",items:[record]});
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({id:"wa-cinema-73880",worldArtId:"73880",worldArtType:"cinema"});
  });
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


describe("catalogue revision retention",()=>{
  it("keeps a revision while it is referenced by either live pointer",()=>{
    expect(isCatalogRevisionPinned(12,12,14)).toBe(true);
    expect(isCatalogRevisionPinned(14,12,14)).toBe(true);
    expect(isCatalogRevisionPinned(11,12,14)).toBe(false);
    expect(isCatalogRevisionPinned(12,null,14)).toBe(false);
    expect(isCatalogRevisionPinned(0,0,0)).toBe(false);
  });
});
