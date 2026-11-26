import { describe, expect, it } from "vitest";
import { appendKey } from "./NumberPad";
import type { UnitQuestion } from "./unitContent";
import {
  canAdvance,
  createUnitAnswerState,
  hideUnitAnswer,
  isAnswerCorrect,
  revealUnitAnswer,
  submitUnitAnswer,
  toAttemptInput,
  toRevealAttemptInput,
} from "./unitQuizModel";

const numeric = {
  id: "n", grade: 3, unitCategory: "length", questionType: "conversion",
  prompt: "3kmは 何mですか。", explanation: "せつめい", requiredUnits: ["km", "m"],
  answerType: "numeric", answerUnit: "m", answerBaseValue: 3_000_000,
} as UnitQuestion;

const choice = {
  id: "c", grade: 3, unitCategory: "length", questionType: "comparison",
  prompt: "とい", explanation: "せつめい", requiredUnits: ["km", "m"],
  answerType: "choice",
  choices: [{ id: "left", label: "2km" }, { id: "right", label: "1900m" }],
  answerChoiceId: "right",
} as UnitQuestion;

describe("appendKey", () => {
  it("数字を順に足す", () => {
    expect(["1", "2", "3"].reduce((value, key) => appendKey(value, key), "")).toBe("123");
  });

  it("先頭に0を並べない", () => {
    expect(appendKey("0", "5")).toBe("5");
    expect(appendKey("0", "0")).toBe("0");
  });

  it("小数点は1つだけ、先頭には置かない", () => {
    expect(appendKey("1.5", ".")).toBe("1.5");
    expect(appendKey("0", ".")).toBe("0.");
    expect(appendKey("", ".")).toBe("");
  });

  it("桁数の上限を超えない", () => {
    expect(appendKey("123456789012", "9")).toBe("123456789012");
  });
});

describe("submitUnitAnswer", () => {
  it("初回正解を初回正解として記録する", () => {
    const state = createUnitAnswerState();

    expect(toAttemptInput(state, numeric, "3000")).toEqual({
      answer: "3000", correct: true, mistakes: 0, usedGuide: false, firstTryCorrect: true,
    });
    expect(canAdvance(submitUnitAnswer(state, numeric, "3000"))).toBe(true);
  });

  it("誤答は1ミスとして数え、正解まで先へ進めない", () => {
    let state = createUnitAnswerState();

    expect(toAttemptInput(state, numeric, "300")).toMatchObject({ correct: false, mistakes: 1 });
    state = submitUnitAnswer(state, numeric, "300");
    expect(canAdvance(state)).toBe(false);
    expect(state.mistakes).toBe(1);
    expect(toAttemptInput(state, numeric, "3000").firstTryCorrect).toBe(false);

    state = submitUnitAnswer(state, numeric, "3000");
    expect(canAdvance(state)).toBe(true);
  });

  it("正解後の再回答を受け付けない", () => {
    const solved = submitUnitAnswer(createUnitAnswerState(), numeric, "3000");

    expect(submitUnitAnswer(solved, numeric, "9")).toEqual(solved);
  });

  it("選択問題の正解が右でも判定できる", () => {
    expect(isAnswerCorrect(choice, "right")).toBe(true);
    expect(isAnswerCorrect(choice, "left")).toBe(false);

    let state = submitUnitAnswer(createUnitAnswerState(), choice, "left");
    expect(canAdvance(state)).toBe(false);
    state = submitUnitAnswer(state, choice, "right");
    expect(canAdvance(state)).toBe(true);
  });
});

describe("「分からない」", () => {
  it("1ミスとして数え、答えを見ただけでは先へ進めない", () => {
    const state = createUnitAnswerState();

    expect(toRevealAttemptInput(state)).toEqual({
      answer: "", correct: false, mistakes: 1, usedGuide: true, firstTryCorrect: false,
    });

    const revealed = revealUnitAnswer(state);
    expect(revealed.revealed).toBe(true);
    expect(canAdvance(revealed)).toBe(false);
    expect(submitUnitAnswer(revealed, numeric, "3000")).toEqual(revealed);
    expect(revealUnitAnswer(revealed)).toEqual(revealed);
  });

  it("答えを隠した後、自分で正解して初めて進める", () => {
    let state = hideUnitAnswer(revealUnitAnswer(createUnitAnswerState()));

    expect(state.revealed).toBe(false);
    expect(state.mistakes).toBe(1);
    expect(toAttemptInput(state, numeric, "3000").firstTryCorrect).toBe(false);

    state = submitUnitAnswer(state, numeric, "3000");
    expect(canAdvance(state)).toBe(true);
  });

  it("同じ問題で2回目の「分からない」を二重に数えない", () => {
    const state = hideUnitAnswer(revealUnitAnswer(createUnitAnswerState()));

    expect(toRevealAttemptInput(state).mistakes).toBe(0);
  });
});

describe("2つの数で答える問題（何km何m）", () => {
  const compound = {
    id: "s", grade: 3, unitCategory: "length", questionType: "compoundSplit",
    prompt: "2045mは 何km何mですか。", explanation: "せつめい", requiredUnits: ["m", "km"],
    answerType: "compound", answerUnits: ["km", "m"], answerBaseValue: 2_045_000,
  } as UnitQuestion;

  it("2つとも合っていれば正解", () => {
    expect(isAnswerCorrect(compound, "2|45")).toBe(true);
  });

  it("片方だけ合っている、くり上がっていない、形が違う答えは不正解", () => {
    expect(isAnswerCorrect(compound, "2|450")).toBe(false);
    expect(isAnswerCorrect(compound, "1|1045")).toBe(false);
    expect(isAnswerCorrect(compound, "2045|0")).toBe(false);
    expect(isAnswerCorrect(compound, "2.0|45")).toBe(false);
    expect(isAnswerCorrect(compound, "2045")).toBe(false);
  });

  it("答えたあとは2つの欄とも空になり、大きい単位の欄にもどる", () => {
    const typed = { ...createUnitAnswerState(), entry: "2", entrySmall: "450", activeField: "small" as const };
    const after = submitUnitAnswer(typed, compound, "2|450");
    expect(after).toMatchObject({ entry: "", entrySmall: "", activeField: "big", mistakes: 1, solved: false });
    expect(submitUnitAnswer(typed, compound, "2|45")).toMatchObject({ solved: true });
  });
});
