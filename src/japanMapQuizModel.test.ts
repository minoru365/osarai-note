import { describe, expect, it } from "vitest";
import {
  createJapanMapAnswerState,
  hideJapanMapAnswer,
  revealJapanMapAnswer,
  submitJapanMapAnswer,
} from "./japanMapQuizModel";

describe("日本地図の回答状態", () => {
  it("間違いは同じ問題にとどまり、正解で進める", () => {
    const initial = createJapanMapAnswerState();
    const wrong = submitJapanMapAnswer(initial, "tokyo", "osaka");
    expect(wrong).toMatchObject({ selectedId: "osaka", mistakes: 1, solved: false });
    const solved = submitJapanMapAnswer(wrong, "tokyo", "tokyo");
    expect(solved).toMatchObject({ selectedId: "tokyo", mistakes: 1, solved: true });
  });

  it("分からないで答えを表示し、かくすと再回答できる", () => {
    const revealed = revealJapanMapAnswer(createJapanMapAnswerState());
    expect(revealed).toMatchObject({ mistakes: 1, usedGuide: true, revealed: true });
    expect(hideJapanMapAnswer(revealed)).toMatchObject({ usedGuide: true, revealed: false, selectedId: null });
  });
});
