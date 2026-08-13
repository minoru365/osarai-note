import { describe, expect, it } from "vitest";
import {
  applyDakuten,
  applyHandakuten,
  deleteLastKana,
  HIRAGANA_GRID,
  isCorrectReading,
  normalizeReading,
  toggleSmallKana,
} from "./kanaInput";

describe("kana input", () => {
  it("漢字の読みで使わない長音と小さいわを表示しない", () => {
    expect(HIRAGANA_GRID).not.toContain("ー");
    expect(HIRAGANA_GRID).not.toContain("ゎ");
  });

  it("あ行を各行の右端に並べる", () => {
    expect(HIRAGANA_GRID[9]).toBe("あ");
    expect(HIRAGANA_GRID[19]).toBe("い");
    expect(HIRAGANA_GRID[29]).toBe("う");
    expect(HIRAGANA_GRID[39]).toBe("え");
    expect(HIRAGANA_GRID[49]).toBe("お");
  });

  it("小さいゃゅょっへ変換し、もう一度で戻す", () => {
    expect(toggleSmallKana("しよ")).toBe("しょ");
    expect(toggleSmallKana("しょ")).toBe("しよ");
    expect(toggleSmallKana("きゆ")).toBe("きゅ");
    expect(toggleSmallKana("つ")).toBe("っ");
    expect(toggleSmallKana("わ")).toBe("わ");
  });

  it("濁音と半濁音へ変換する", () => {
    expect(applyDakuten("か")).toBe("が");
    expect(applyDakuten("し")).toBe("じ");
    expect(applyDakuten("テ")).toBe("デ");
    expect(applyHandakuten("は")).toBe("ぱ");
    expect(applyHandakuten("ホ")).toBe("ポ");
  });

  it("Unicode文字単位で最後の一字を削除する", () => {
    expect(deleteLastKana("しょく")).toBe("しょ");
  });

  it("ひらがなとカタカナを同じ読みとして判定する", () => {
    expect(normalizeReading("ショクブツ")).toBe("しょくぶつ");
    expect(isCorrectReading("ショクブツ", "しょくぶつ")).toBe(true);
    expect(isCorrectReading("しょく", "しょくぶつ")).toBe(false);
  });
});
