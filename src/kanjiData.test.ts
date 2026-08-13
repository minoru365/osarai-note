import { describe, expect, it, vi } from "vitest";
import materials from "../content-source/kanji-materials.json";
import { japaneseCharDataLoader, supportedCharacters } from "./kanjiData";

describe("Japanese kanji stroke data", () => {
  it("承認済み書き問題の対象漢字をすべて収録する", () => {
    const required = new Set(materials.materials
      .filter((material) => material.reviewStatus === "approved")
      .flatMap((material) => material.targetKanji));
    expect(required.size).toBeGreaterThan(3);
    expect([...required].filter((character) => !supportedCharacters.includes(character))).toEqual([]);
  });

  it("暗のストロークデータを読み込める", () => {
    const onComplete = vi.fn();
    const onError = vi.fn();
    japaneseCharDataLoader("暗", onComplete, onError);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });
});
