import { describe, expect, it } from "vitest";
import {
  countStudyDays,
  masteredKanji,
  rankUnitStates,
  skillLevel,
  summarizeUnitCategories,
  weakKanji,
} from "./Achievements";
import {
  createEmptyKanjiSkillStats,
  createEmptyUnitState,
  type KanjiState,
  type StudyAttempt,
} from "./storage/schema";

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

describe("rankUnitStates", () => {
  const unitState = (key: string, weakness: number, presentations: number) => ({
    ...createEmptyUnitState(key, ""),
    weakness,
    presentations,
  });

  it("苦手度の高い順に並べる", () => {
    expect(rankUnitStates([
      unitState("length:conversion", 2, 5),
      unitState("weight:comparison", 7, 3),
      unitState("time:conversion", 5, 4),
    ]).map((state) => state.key)).toEqual([
      "weight:comparison",
      "time:conversion",
      "length:conversion",
    ]);
  });

  it("まだ出題されていない集計は載せない", () => {
    expect(rankUnitStates([unitState("length:conversion", 0, 0)])).toEqual([]);
  });
});

describe("たんいを単位ごとにまとめる", () => {
  const unitState = (key: string, weakness: number, presentations: number, firstTryCorrect = 0) => ({
    ...createEmptyUnitState(key, ""),
    weakness,
    presentations,
    firstTryCorrect,
  });

  it("問題タイプをまたいで1つの単位へ集約する", () => {
    const summaries = summarizeUnitCategories([
      unitState("length:conversion", 4, 6, 2),
      unitState("length:comparison", 1, 4, 3),
      unitState("time:conversion", 2, 5, 4),
    ]);

    expect(summaries.map((item) => item.category)).toEqual(["length", "time"]);
    const length = summaries.find((item) => item.category === "length");
    expect(length?.label).toBe("長さ");
    expect(length?.presentations).toBe(10);
    expect(length?.firstTryCorrect).toBe(5);
    // (4×6 + 1×4) / 10 = 2.8 -> 3
    expect(length?.weakness).toBe(3);
  });

  it("練習していない単位は出さない", () => {
    expect(summarizeUnitCategories([unitState("area:conversion", 0, 0)])).toEqual([]);
  });

  it("出題の多い問題タイプの苦手度を重く見る", () => {
    const [summary] = summarizeUnitCategories([
      unitState("weight:conversion", 0, 20),
      unitState("weight:wordProblem", 10, 1),
    ]);
    // One stray answer must not brand the whole unit にがて.
    expect(summary.weakness).toBe(0);
    expect(skillLevel(summary.weakness, summary.presentations).label).toBe("とくい");
  });
});

describe("skillLevel", () => {
  it("未挑戦と、ミス無しで終えた状態を区別する", () => {
    expect(skillLevel(0, 0)).toEqual({ key: "none", label: "まだ" });
    expect(skillLevel(0, 3)).toEqual({ key: "good", label: "とくい" });
  });

  it("苦手度3以上をにがて、1〜2をもう少しとする", () => {
    // 1〜4の帯が丸ごと見えていなかったので、しきい値を5から3へ下げた。
    expect(skillLevel(3, 5).label).toBe("にがて");
    expect(skillLevel(10, 5).label).toBe("にがて");
    expect(skillLevel(1, 5).label).toBe("もう少し");
    expect(skillLevel(2, 5).label).toBe("もう少し");
  });
});
