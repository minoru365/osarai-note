import { describe, expect, it } from "vitest";
import { GROWTH_STAGE_COUNT, growthStage, isPetNeglected } from "./schema";

describe("growthStage", () => {
  it("0ポイントは1段階目", () => {
    expect(growthStage(0)).toBe(1);
  });

  it("100ポイントごとに1段階進む", () => {
    expect(growthStage(99)).toBe(1);
    expect(growthStage(100)).toBe(2);
    expect(growthStage(250)).toBe(3);
    expect(growthStage(499)).toBe(5);
  });

  it("最大段階を超えない", () => {
    expect(growthStage(500)).toBe(GROWTH_STAGE_COUNT);
    expect(growthStage(9999)).toBe(GROWTH_STAGE_COUNT);
  });
});

describe("isPetNeglected", () => {
  it("回答履歴がなければしょんぼりにしない", () => {
    expect(isPetNeglected(null, new Date("2026-08-14T00:00:00.000Z"))).toBe(false);
  });

  it("3日未満なら元気なまま", () => {
    expect(isPetNeglected(
      "2026-08-14T10:00:00.000Z",
      new Date("2026-08-17T09:59:59.000Z"),
    )).toBe(false);
  });

  it("3日以上たつとしょんぼりになる", () => {
    expect(isPetNeglected(
      "2026-08-14T10:00:00.000Z",
      new Date("2026-08-17T10:00:00.000Z"),
    )).toBe(true);
  });

  it("直近の回答があれば即座に元気へ戻る", () => {
    expect(isPetNeglected(
      "2026-08-17T09:59:00.000Z",
      new Date("2026-08-17T10:00:00.000Z"),
    )).toBe(false);
  });
});
