import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import type { KanjiQuestion } from "./contentPack";
import { getOrCreateDailySession, selectDailyQuestions, startNextDailyBatch, summarizeDailySession } from "./dailySession";
import { StudyStorage } from "./storage/indexedDb";
import { createEmptyKanjiSkillStats, type KanjiState } from "./storage/schema";

const question = (id: string, word: string): KanjiQuestion => ({
  id,
  grade: 3,
  mode: "reading",
  word,
  reading: "よみ",
  prompt: "問題",
  promptBefore: "",
  promptAfter: "を読む。",
  targetKanji: Array.from(word),
  answerKanji: word,
});

const state = (kanji: string, weakness: number, learned = true, presentations = 0): KanjiState => ({
  kanji,
  learned,
  reading: { ...createEmptyKanjiSkillStats(), weakness, presentations },
  writing: createEmptyKanjiSkillStats(),
  updatedAt: "2026-08-14T00:00:00.000Z",
});

describe("selectDailyQuestions", () => {
  it("未習漢字を除外し、練習回数の少ない問題を優先する", () => {
    const selected = selectDailyQuestions(
      [question("easy", "山"), question("hard", "海"), question("unlearned", "川")],
      { mode: "reading", states: [state("山", 1, true, 0), state("海", 5, true, 3), state("川", 10, false)] },
    );
    expect(selected.map((item) => item.id)).toEqual(["easy", "hard"]);
  });

  it("同じ練習回数では苦手度を使わず、開始シードでランダム順を作る", () => {
    const questions = Array.from({ length: 12 }, (_, index) => question(`q-${index}`, String.fromCodePoint(0x4e00 + index)));
    const states = questions.map((item, index) => state(item.targetKanji[0], index, true, 2));
    const first = selectDailyQuestions(questions, { mode: "reading", seed: "start-a", states });
    const repeated = selectDailyQuestions(questions, { mode: "reading", seed: "start-a", states });
    const another = selectDailyQuestions(questions, { mode: "reading", seed: "start-b", states });
    expect(repeated).toEqual(first);
    expect(another.map((item) => item.id)).not.toEqual(first.map((item) => item.id));
  });

  it("セット内で同じ漢字を避け、候補不足時だけ重複を許す", () => {
    const selected = selectDailyQuestions(
      [question("leaf-1", "葉"), question("leaf-2", "葉"), question("sea", "海")],
      { mode: "reading", states: [state("葉", 5), state("海", 1)], limit: 3 },
    );
    expect(new Set(selected.slice(0, 2).flatMap((item) => item.targetKanji)).size).toBe(2);
    expect(selected.slice(0, 2).some((item) => item.id === "sea")).toBe(true);
    expect(selected).toHaveLength(3);
  });

});

describe("daily session service", () => {
  it("未完了セットがあっても、押すたびに新しいセットを作る", async () => {
    const storage = new StudyStorage(new IDBFactory(), "daily-session-test");
    const questions = [question("q1", "葉"), question("q2", "海")];
    const now = new Date("2026-08-14T10:00:00+09:00");

    const first = await getOrCreateDailySession(storage, questions, "reading", now);
    expect(first).toMatchObject({ id: "2026-08-14:reading:1", currentIndex: 0 });
    expect(await getOrCreateDailySession(storage, questions, "reading", now)).toEqual(first);
    const second = await startNextDailyBatch(storage, questions, "reading", now, "second-press");
    expect(second).toMatchObject({ id: "2026-08-14:reading:2", currentIndex: 0 });
    expect(second?.questionIds).toHaveLength(2);
  });
});

it("完了結果を初回正解・ミス後正解・分からないへ重複なく分類する", () => {
  const baseItem = {
    status: "completed" as const,
    mistakeCount: 0,
    usedGuide: false,
    impacts: { 葉: "decrease" as const },
    unknownKanji: [] as string[],
    completedAt: "2026-08-14T10:00:00.000Z",
  };
  expect(summarizeDailySession({
    id: "summary",
    localDate: "2026-08-14",
    mode: "reading",
    batchNumber: 1,
    questionIds: ["a", "b", "c"],
    items: [
      { ...baseItem, id: "a", questionId: "a" },
      { ...baseItem, id: "b", questionId: "b", mistakeCount: 1, impacts: { 海: "increase" } },
      { ...baseItem, id: "c", questionId: "c", usedGuide: true, unknownKanji: ["川"] },
    ],
    currentIndex: 3,
    startedAt: "2026-08-14T09:00:00.000Z",
    updatedAt: "2026-08-14T10:00:00.000Z",
    completedAt: "2026-08-14T10:00:00.000Z",
  })).toEqual({ firstTryCorrect: 1, correctedAfterMistake: 1, unknown: 1 });
});
