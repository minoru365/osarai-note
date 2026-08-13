import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import type { KanjiQuestion } from "./contentPack";
import { getOrCreateDailySession, selectDailyQuestions, startNextDailyBatch, summarizeDailySession } from "./dailySession";
import { StudyStorage } from "./storage/indexedDb";
import { createEmptyKanjiSkillStats, type KanjiState, type StudyAttempt } from "./storage/schema";

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

const state = (kanji: string, weakness: number, learned = true): KanjiState => ({
  kanji,
  learned,
  reading: { ...createEmptyKanjiSkillStats(), weakness },
  writing: createEmptyKanjiSkillStats(),
  updatedAt: "2026-08-14T00:00:00.000Z",
});

const attempt = (questionId: string, answeredAt: string): StudyAttempt => ({
  id: `${questionId}:${answeredAt}`,
  sessionId: "old",
  questionId,
  subject: "kanji",
  mode: "reading",
  answer: "",
  correct: true,
  mistakes: 0,
  usedGuide: false,
  answeredAt,
});

describe("selectDailyQuestions", () => {
  it("未習漢字を除外し、苦手度の高い問題を優先する", () => {
    const selected = selectDailyQuestions(
      [question("easy", "山"), question("hard", "海"), question("unlearned", "川")],
      { mode: "reading", states: [state("山", 1), state("海", 5), state("川", 10, false)] },
    );
    expect(selected.map((item) => item.id)).toEqual(["hard", "easy"]);
  });

  it("同じ苦手度では未出題、次に回答日の古い問題を優先する", () => {
    const selected = selectDailyQuestions(
      [question("new", "山"), question("old", "海"), question("recent", "川")],
      {
        mode: "reading",
        states: [state("山", 2), state("海", 2), state("川", 2)],
        attempts: [attempt("old", "2026-08-01T00:00:00.000Z"), attempt("recent", "2026-08-13T00:00:00.000Z")],
      },
    );
    expect(selected.map((item) => item.id)).toEqual(["new", "old", "recent"]);
  });

  it("セット内で同じ漢字を避け、候補不足時だけ重複を許す", () => {
    const selected = selectDailyQuestions(
      [question("leaf-1", "葉"), question("leaf-2", "葉"), question("sea", "海")],
      { mode: "reading", states: [state("葉", 5), state("海", 1)], limit: 3 },
    );
    expect(selected[0].targetKanji).toEqual(["葉"]);
    expect(selected[1].id).toBe("sea");
    expect(selected).toHaveLength(3);
  });

  it("追加セットでは今日まだ扱っていない漢字を最優先する", () => {
    const selected = selectDailyQuestions(
      [question("seen-question", "葉"), question("same-kanji", "葉"), question("fresh", "海")],
      {
        mode: "reading",
        states: [state("葉", 10), state("海", 0)],
        seenQuestionIds: ["seen-question"],
        seenKanji: ["葉"],
      },
    );
    expect(selected[0].id).toBe("fresh");
  });
});

describe("daily session service", () => {
  it("今日の未完了セットを再開し、完了後だけ追加セットを作る", async () => {
    const storage = new StudyStorage(new IDBFactory(), "daily-session-test");
    const questions = [question("q1", "葉"), question("q2", "海")];
    const now = new Date("2026-08-14T10:00:00+09:00");

    const first = await getOrCreateDailySession(storage, questions, "reading", now);
    expect(first).toMatchObject({ id: "2026-08-14:reading:1", currentIndex: 0 });
    expect(await getOrCreateDailySession(storage, questions, "reading", now)).toEqual(first);
    expect(await startNextDailyBatch(storage, questions, "reading", now)).toEqual(first);
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
