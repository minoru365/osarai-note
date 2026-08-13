import { describe, expect, it } from "vitest";
import { getKanjiByGrade, KANJI_CATALOG } from "./kanjiCatalog";
import { filterEligibleKanji, isKanjiEligible } from "./kanjiEligibility";
import type { KanjiState } from "./storage/schema";

describe("kanji catalog", () => {
  it("文科省配当表どおり3年生200字・4年生202字を重複なく持つ", () => {
    expect(getKanjiByGrade(3)).toHaveLength(200);
    expect(getKanjiByGrade(4)).toHaveLength(202);
    expect(new Set(KANJI_CATALOG.map((entry) => entry.character)).size).toBe(402);
  });
});

describe("kanji eligibility", () => {
  const entry = { character: "植", grade: 3 as const };

  it("未設定または習った漢字を出題対象にする", () => {
    expect(isKanjiEligible(entry, undefined)).toBe(true);
    expect(isKanjiEligible(entry, state(true))).toBe(true);
  });

  it("まだ習っていない漢字を出題対象から外す", () => {
    expect(isKanjiEligible(entry, state(false))).toBe(false);
    expect(filterEligibleKanji([entry], new Map([["植", state(false)]]))).toEqual([]);
  });

  function state(learned: boolean): KanjiState {
    return {
      kanji: "植",
      learned,
      readingMastery: 0,
      writingMastery: 0,
      nextReviewAt: null,
      updatedAt: "2026-08-13T00:00:00.000Z",
    };
  }
});
