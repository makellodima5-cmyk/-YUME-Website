import {describe,expect,it} from "vitest";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {isCreditworthyPlaybackStep,mergeWatchedSegments} from "@/data/yubera-episode-watch.server";
describe("server episode playback accounting",()=>{it("merges overlapping timeline ranges without double-counting",()=>{expect(mergeWatchedSegments([[0,10],[18,25]],8,20)).toEqual([[0,25]]);expect(mergeWatchedSegments([[0,10]],8,20)).toEqual([[0,20]]);});it("accepts ordinary playback and rejects seeks and long gaps",()=>{expect(isCreditworthyPlaybackStep(10,22,10)).toBe(true);expect(isCreditworthyPlaybackStep(10,24,10)).toBe(false);expect(isCreditworthyPlaybackStep(10,80,10)).toBe(false);expect(isCreditworthyPlaybackStep(30,20,10)).toBe(false);expect(isCreditworthyPlaybackStep(10,20,60)).toBe(false);expect(isCreditworthyPlaybackStep(10,20,2)).toBe(false);});});


it("requires an atomic D1 batch before awarding episode completion XP",async()=>{const source=await readFile(resolve(process.cwd(),"src/data/yubera-episode-watch.server.ts"),"utf8");expect(source).toContain('if(!d.batch)return json({error:"atomic_watch_xp_batch_unavailable"},503)');expect(source).toContain("const results=await d.batch([update,award])");expect(source).not.toContain("else{await update.run();");});
