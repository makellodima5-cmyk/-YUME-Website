import { describe, expect, it } from "vitest";
import { YUBERA_SUPPORT_LEVELS } from "@/data/yubera-config";

describe("YUBERA support status tiers", () => {
  it("keeps the requested Stars thresholds and links all five uploaded status emblems", () => {
    expect(YUBERA_SUPPORT_LEVELS.map(({ min }) => min)).toEqual([0, 50, 1000, 2500, 5000, 10000]);
    expect(YUBERA_SUPPORT_LEVELS.slice(1).map(({ asset }) => asset)).toEqual([
      "YUBERA_Status_01_Soyuznik.webp",
      "YUBERA_Status_02_Storonnik.webp",
      "YUBERA_Status_03_Predanniy_Uchastnik.webp",
      "YUBERA_Status_04_Pochetnyy_Pokrovitel.webp",
      "YUBERA_Support_Status_05_Legend.webp",
    ]);
  });
});
