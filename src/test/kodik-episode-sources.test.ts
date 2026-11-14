import {describe,expect,it} from "vitest";
import {parseKodikEpisodeSources} from "@/data/kodik-episode-sources.server";
describe("Kodik episode sources",()=>{it("returns only the requested anime and keeps voiceovers separate",()=>{expect(parseKodikEpisodeSources({results:[{shikimori_id:"42",translation:{id:7,title:"Voice A"},episodes:{"1":"https://kodik.info/a","2":"https://kodik.info/b"}},{shikimori_id:"42",translation:{id:8,title:"Voice B"},episodes:{"1":"https://kodikres.com/c"}},{shikimori_id:"99",translation:{id:9,title:"Other"},episodes:{"1":"https://kodik.info/d"}}]},"42")).toEqual([{id:"7",title:"Voice A",episodes:[1,2]},{id:"8",title:"Voice B",episodes:[1]}])});it("rejects malformed and mismatched API responses",()=>{expect(()=>parseKodikEpisodeSources({},"42")).toThrow();expect(()=>parseKodikEpisodeSources({results:[{shikimori_id:"99",translation:{id:1,title:"Other"},episodes:{}}]},"42")).toThrow(/does not match/)})});


describe("Kodik-only catalogue IDs",()=>{
  it("selects the requested native Kodik material ID without requiring a Shikimori ID",()=>{
    const payload={results:[{id:"serial-12345",title:"Example",translation:{id:"voice-1",title:"Voice 1"},episodes:{"1":"https://kodik.info/serial/abc"}},{id:"serial-67890",shikimori_id:42,title:"Other",translation:{id:"voice-2",title:"Voice 2"},episodes:{"1":"https://kodik.info/serial/def"}}]};
    expect(parseKodikEpisodeSources(payload,"kodik-serial-12345")).toEqual([{id:"voice-1",title:"Voice 1",episodes:[1]}]);
  });
});
