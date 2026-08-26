import { describe, expect, it } from "vitest";
import { getUnitStateKey, type UnitQuestion } from "./unitContent";
import {
  createUnitSession,
  isUnitQuestionAllowed,
  selectUnitQuestions,
  summarizeUnitSession,
} from "./unitSession";
import { createEmptyUnitState, type UnitState } from "./storage/schema";

function question(
  id: string,
  unitCategory: UnitQuestion["unitCategory"],
  questionType: UnitQuestion["questionType"],
  grade: 3 | 4 = 3,
): UnitQuestion {
  return {
    id,
    grade,
    unitCategory,
    questionType,
    prompt: "とい",
    explanation: "せつめい",
    requiredUnits: ["m"],
    answerType: "numeric",
    answerUnit: "m",
    answerBaseValue: 1_000,
  } as UnitQuestion;
}

function state(key: string, presentations: number): UnitState {
  return { ...createEmptyUnitState(key, ""), presentations };
}

const questions: UnitQuestion[] = [
  question("len-conv-1", "length", "conversion"),
  question("len-conv-2", "length", "conversion"),
  question("len-comp-1", "length", "comparison"),
  question("wei-conv-1", "weight", "conversion"),
  question("area-conv-1", "area", "conversion", 4),
];

describe("selectUnitQuestions", () => {
  it("集計キーが重ならないよう散らしてから同じキーを許す", () => {
    const selected = selectUnitQuestions(questions, { limit: 3, seed: "spread" });

    expect(selected).toHaveLength(3);
    expect(new Set(selected.map(getUnitStateKey)).size).toBe(3);
  });

  it("同じ種でも足りなければ同じキーから補充する", () => {
    const selected = selectUnitQuestions(questions, { limit: 5, seed: "fill" });

    expect(selected).toHaveLength(5);
    expect(new Set(selected.map((item) => item.id)).size).toBe(5);
  });

  it("同じ種は同じ順、違う種は違う順になる", () => {
    const first = selectUnitQuestions(questions, { seed: "a" }).map((item) => item.id);

    expect(selectUnitQuestions(questions, { seed: "a" }).map((item) => item.id)).toEqual(first);
    expect(selectUnitQuestions(questions, { seed: "b" }).map((item) => item.id)).not.toEqual(first);
  });

  it("練習回数の少ない集計キーを先に出す", () => {
    const selected = selectUnitQuestions(questions, {
      limit: 2,
      seed: "ranked",
      states: [state("length:conversion", 9), state("weight:conversion", 0)],
    });

    expect(selected.map(getUnitStateKey)).toContain("weight:conversion");
    expect(selected.map(getUnitStateKey)).not.toContain("length:conversion");
  });

  it("未履修の系統・学年を除外する", () => {
    expect(isUnitQuestionAllowed(question("x", "area", "conversion", 4), ["area:4"])).toBe(false);
    expect(isUnitQuestionAllowed(question("x", "area", "conversion", 4), ["area:3"])).toBe(true);

    const selected = selectUnitQuestions(questions, { unlearnedGroups: ["area:4"], seed: "gate" });
    expect(selected.some((item) => item.unitCategory === "area")).toBe(false);
  });

  it("すべて未履修なら空になる", () => {
    expect(selectUnitQuestions(questions, {
      unlearnedGroups: ["length:3", "weight:3", "area:4"],
    })).toEqual([]);
  });
});

describe("createUnitSession", () => {
  it("教科と集計キーを持つ未回答の項目を作る", () => {
    const session = createUnitSession(
      "2026-08-26",
      1,
      questions.slice(0, 2),
      new Date("2026-08-26T10:00:00.000Z"),
    );

    expect(session.id).toBe("2026-08-26:units:quiz:1");
    expect(session).toMatchObject({ subject: "units", mode: "quiz", currentIndex: 0 });
    expect(session.items).toEqual([
      expect.objectContaining({
        questionId: "len-conv-1",
        status: "pending",
        unitStateKey: "length:conversion",
        counted: false,
        unknownCounted: false,
      }),
      expect.objectContaining({ questionId: "len-conv-2", unitStateKey: "length:conversion" }),
    ]);
  });
});

describe("summarizeUnitSession", () => {
  it("初回正解・ミス後正解・分からないへ重複なく分類する", () => {
    const session = createUnitSession(
      "2026-08-26",
      1,
      questions.slice(0, 3),
      new Date("2026-08-26T10:00:00.000Z"),
    );
    const completed = {
      ...session,
      items: session.items.map((item, index) => ({
        ...item,
        status: "completed" as const,
        mistakeCount: index === 1 ? 2 : 0,
        unknownCounted: index === 2,
      })),
    };

    expect(summarizeUnitSession(completed)).toEqual({
      firstTryCorrect: 1,
      correctedAfterMistake: 1,
      unknown: 1,
    });
  });

  it("未完了の問題は数えない", () => {
    const session = createUnitSession(
      "2026-08-26",
      1,
      questions.slice(0, 2),
      new Date("2026-08-26T10:00:00.000Z"),
    );

    expect(summarizeUnitSession(session)).toEqual({
      firstTryCorrect: 0,
      correctedAfterMistake: 0,
      unknown: 0,
    });
  });
});
