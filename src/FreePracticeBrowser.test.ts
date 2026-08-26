import { describe, expect, it } from "vitest";
import type { KanjiQuestion } from "./contentPack";
import {
  buildReadingIndex,
  countQuestionsPerKanji,
  createFreePracticeBatch,
  filterFreePracticeQuestions,
  matchesKanjiSearch,
  normalizeReading,
  stableRandomOrder,
} from "./FreePracticeBrowser";
import { createEmptyKanjiSkillStats, type KanjiState } from "./storage/schema";

const question = (id: string, targetKanji: string[]): KanjiQuestion => ({
  id, grade: 3, mode: "reading", word: targetKanji.join(""), reading: "かな", prompt: "読む",
  promptBefore: "", promptAfter: "", targetKanji, answerKanji: targetKanji.join(""),
});

const state = (kanji: string, learned: boolean): KanjiState => ({
  kanji, learned, reading: createEmptyKanjiSkillStats(), writing: createEmptyKanjiSkillStats(), updatedAt: "2026-08-14T00:00:00.000Z",
});

describe("free practice browser", () => {
  it("未履修漢字を1字でも含む問題を一覧から除外する", () => {
    const states = new Map([state("植", true), state("物", false)].map((item) => [item.kanji, item]));
    expect(filterFreePracticeQuestions([
      question("leaf", ["葉"]), question("plant", ["植", "物"]),
    ], states).map((item) => item.id)).toEqual(["leaf"]);
  });

  it("同じシードならランダム順を固定し、項目を欠落させない", () => {
    const items = ["悪", "安", "暗", "医", "委", "意", "育", "員", "院", "飲", "運"];
    const first = stableRandomOrder(items, "batch-a", (item) => item);
    expect(stableRandomOrder(items, "batch-a", (item) => item)).toEqual(first);
    expect(new Set(first)).toEqual(new Set(items));
    expect(stableRandomOrder(items, "batch-b", (item) => item)).not.toEqual(first);
  });

  it("読み書きのペアを1問として扱い、漢字指定と最大10問を守る", () => {
    const questions = Array.from({ length: 12 }, (_, index) => {
      const reading = question(`pair-${index}:reading`, index < 11 ? ["暗"] : ["葉"]);
      return [
        { ...reading, pairId: `pair-${index}` },
        {
          ...reading,
          id: `pair-${index}:writing`,
          pairId: `pair-${index}`,
          mode: "writing" as const,
          readingBefore: "",
          answerReading: "かな",
          readingAfter: "",
        },
      ];
    }).flat();

    const batch = createFreePracticeBatch(questions, "kanji-seed", "暗");
    expect(batch).toHaveLength(10);
    expect(batch.every((item) => item.mode === "reading" && item.targetKanji.includes("暗"))).toBe(true);
    expect(new Set(batch.map((item) => item.pairId)).size).toBe(10);
  });
});

describe("読みでの漢字検索", () => {
  const readingQuestion = (id: string, primaryKanji: string, canonicalReading: string): KanjiQuestion => ({
    ...question(id, [primaryKanji]), primaryKanji, canonicalReading,
  });

  it("カタカナの音読みをひらがなへそろえる", () => {
    expect(normalizeReading("ショク")).toBe("しょく");
    expect(normalizeReading(" わるい ")).toBe("わるい");
  });

  it("1つの漢字が持つ読みを重複なく集める", () => {
    const index = buildReadingIndex([
      readingQuestion("a", "悪", "アク"),
      readingQuestion("b", "悪", "わるい"),
      readingQuestion("c", "悪", "アク"),
    ]);
    expect(index.get("悪")).toEqual(["アク", "わるい"]);
  });

  it("ひらがなでもカタカナでも同じ漢字に当たり、漢字そのものでも引ける", () => {
    const readings = ["アク", "わるい"];
    expect(matchesKanjiSearch("悪", readings, "あく")).toBe(true);
    expect(matchesKanjiSearch("悪", readings, "アク")).toBe(true);
    expect(matchesKanjiSearch("悪", readings, "わる")).toBe(true);
    expect(matchesKanjiSearch("悪", readings, "悪")).toBe(true);
    expect(matchesKanjiSearch("悪", readings, "ようこ")).toBe(false);
  });

  it("空の検索語はすべてを通す", () => {
    expect(matchesKanjiSearch("悪", ["アク"], "")).toBe(true);
    expect(matchesKanjiSearch("悪", [], "   ")).toBe(true);
  });

  it("読みを持たない漢字は検索語があると外れる", () => {
    expect(matchesKanjiSearch("葉", [], "は")).toBe(false);
  });

  it("問題数はペア単位で数え、10問で頭打ちにする", () => {
    const questions = Array.from({ length: 12 }, (_, index) => ({
      ...question(`pair-${index}:reading`, ["暗"]), pairId: `pair-${index}`,
    }));
    const counts = countQuestionsPerKanji([
      ...questions,
      ...questions.map((item) => ({ ...item, id: item.id.replace("reading", "writing") })),
      { ...question("leaf:reading", ["葉"]), pairId: "leaf" },
    ]);
    expect(counts.get("暗")).toBe(10);
    expect(counts.get("葉")).toBe(1);
  });
});
