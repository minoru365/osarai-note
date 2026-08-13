import { describe, expect, it } from "vitest";
import {
  completeCurrentCharacter,
  createWordProgress,
  isWordComplete,
} from "./quizModel";

describe("word quiz progress", () => {
  it("複数文字を一文字ずつ完了する", () => {
    let progress = createWordProgress("植物");

    progress = completeCurrentCharacter(progress, {
      character: "植",
      mistakes: 1,
      usedGuide: false,
    });

    expect(progress.currentIndex).toBe(1);
    expect(isWordComplete(progress)).toBe(false);

    progress = completeCurrentCharacter(progress, {
      character: "物",
      mistakes: 0,
      usedGuide: true,
    });

    expect(isWordComplete(progress)).toBe(true);
    expect(progress.results).toEqual([
      { character: "植", mistakes: 1, usedGuide: false },
      { character: "物", mistakes: 0, usedGuide: true },
    ]);
  });

  it("現在の文字と異なる完了結果を拒否する", () => {
    const progress = createWordProgress("植物");

    expect(() =>
      completeCurrentCharacter(progress, {
        character: "物",
        mistakes: 0,
        usedGuide: false,
      }),
    ).toThrow("完了文字が一致しません");
  });
});
