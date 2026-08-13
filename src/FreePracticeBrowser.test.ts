import { describe, expect, it } from "vitest";
import type { KanjiQuestion } from "./contentPack";
import { filterFreePracticeQuestions, stableRandomOrder } from "./FreePracticeBrowser";
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
});
