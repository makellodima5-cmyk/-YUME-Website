import {describe,expect,it} from "vitest";
import {parseKodikEpisodeSources} from "@/data/kodik-episode-sources.server";
describe("Kodik episode sources",()=>{it("returns only the requested anime and keeps voiceovers separate",()=>{expect(parseKodikEpisodeSources({results:[{shikimori_id:"42",translation:{id:7,title:"Voice A"},episodes:{"1":"https://kodik.info/a","2":"https://kodik.info/b"}},{shikimori_id:"42",translation:{id:8,title:"Voice B"},episodes:{"1":"https://kodikres.com/c"}},{shikimori_id:"99",translation:{id:9,title:"Other"},episodes:{"1":"https://kodik.info/d"}}]},"42")).toEqual([{id:"7",title:"Voice A",episodes:[1,2]},{id:"8",title:"Voice B",episodes:[1]}])});it("rejects malformed and mismatched API responses",()=>{expect(()=>parseKodikEpisodeSources({},"42")).toThrow();expect(()=>parseKodikEpisodeSources({results:[{shikimori_id:"99",translation:{id:1,title:"Other"},episodes:{}}]},"42")).toThrow(/does not match/)})});

it("resolves World Art-only titles without requiring a Shikimori ID", () => {
  expect(parseKodikEpisodeSources({ results: [
    { worldart_link: "http://www.world-art.ru/animation/animation.php?id=262", translation: { id: 7, title: "Voice A" }, episodes: { "1": "https://kodik.info/a" } },
    { worldart_animation_id: 262, translation: { id: 8, title: "Voice B" }, episodes: { "1": "https://kodikres.com/b" } },
    { worldart_animation_id: 999, translation: { id: 9, title: "Other" }, episodes: { "1": "https://kodik.info/c" } },
  ] }, "262", "262")).toEqual([
    { id: "7", title: "Voice A", episodes: [1] },
    { id: "8", title: "Voice B", episodes: [1] },
  ]);
});


it("exposes an episode count per voice-over in API response mapping", () => {
  const sources = [
    { id: "7", title: "Voice A", episodes: [{ number: 1 }, { number: 2 }] },
    { id: "8", title: "Voice B", episodes: [{ number: 1 }] },
  ];
  expect(sources.map((source) => ({ title: source.title, label: source.title + " (" + source.episodes.length + ".эп)" }))).toEqual([
    { title: "Voice A", label: "Voice A (2.эп)" },
    { title: "Voice B", label: "Voice B (1.эп)" },
  ]);
});
