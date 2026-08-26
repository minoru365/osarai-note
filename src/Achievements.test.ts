import { describe, expect, it } from "vitest";
import { countStudyDays, masteredKanji, weakKanji } from "./Achievements";
import { createEmptyKanjiSkillStats, type KanjiState, type StudyAttempt } from "./storage/schema";

function state(kanji: string, readingWeakness: number, writingWeakness: number, presentations = 1): KanjiState {
  return {
    kanji,
    learned: true,
    reading: { ...createEmptyKanjiSkillStats(), weakness: readingWeakness, presentations },
    writing: { ...createEmptyKanjiSkillStats(), weakness: writingWeakness, presentations },
    updatedAt: "2026-08-25T00:00:00.000Z",
  };
}

describe("masteredKanji", () => {
  it("読みか書きのどちらかが苦手度0なら『できるようになった』に含める", () => {
    expect(masteredKanji([state("葉", 0, 3), state("暗", 4, 4)])).toEqual(["葉"]);
  });

  it("一度も出題されていない漢字は含めない", () => {
    expect(masteredKanji([state("葉", 0, 0, 0)])).toEqual([]);
  });
});

describe("weakKanji", () => {
  it("苦手度5以上を『もう少し』に含める", () => {
    expect(weakKanji([state("葉", 5, 0), state("暗", 0, 0), state("委", 0, 6)])).toEqual(["委", "葉"]);
  });
});

describe("countStudyDays", () => {
  it("回答日時の重複を除いた日数を数える", () => {
    const attempts: StudyAttempt[] = [
      { id: "1", sessionId: "s", questionId: "q", subject: "kanji", mode: "reading", answer: "", correct: true, mistakes: 0, usedGuide: false, answeredAt: "2026-08-14T10:00:00.000Z" },
      { id: "2", sessionId: "s", questionId: "q", subject: "kanji", mode: "reading", answer: "", correct: true, mistakes: 0, usedGuide: false, answeredAt: "2026-08-14T20:00:00.000Z" },
      { id: "3", sessionId: "s", questionId: "q", subject: "kanji", mode: "reading", answer: "", correct: true, mistakes: 0, usedGuide: false, answeredAt: "2026-08-15T09:00:00.000Z" },
    ];

    expect(countStudyDays(attempts)).toBe(2);
  });

  it("回答が無ければ0日", () => {
    expect(countStudyDays([])).toBe(0);
  });
});
