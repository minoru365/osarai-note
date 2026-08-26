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
  const weakState = (kanji: string, weakness: number, lastPresentedAt = "") => ({
    ...state(kanji, weakness, true, 5),
    reading: { ...createEmptyKanjiSkillStats(), weakness, presentations: 5, lastPresentedAt },
  });

  it("苦手枠は最大4問までで、残りはカバレッジ枠が埋める", () => {
    // 6字が苦手。苦手枠は4問が上限なので、残る6問は練習回数の少ない字から。
    const weak = Array.from({ length: 6 }, (_, i) => question(`weak-${i}`, String.fromCodePoint(0x5b50 + i)));
    const fresh = Array.from({ length: 10 }, (_, i) => question(`fresh-${i}`, String.fromCodePoint(0x6708 + i)));
    const states = [
      ...weak.map((q) => weakState(q.targetKanji[0], 8)),
      ...fresh.map((q) => state(q.targetKanji[0], 0, true, 0)),
    ];
    const selected = selectDailyQuestions([...weak, ...fresh], { mode: "reading", states, seed: "s" });

    expect(selected).toHaveLength(10);
    expect(selected.filter((item) => item.id.startsWith("weak-"))).toHaveLength(4);
    expect(selected.filter((item) => item.id.startsWith("fresh-"))).toHaveLength(6);
  });

  it("苦手枠はノルマではなく、該当が無ければ全部カバレッジ枠になる", () => {
    const fresh = Array.from({ length: 12 }, (_, i) => question(`fresh-${i}`, String.fromCodePoint(0x6708 + i)));
    const states = fresh.map((q) => state(q.targetKanji[0], 0, true, 0));
    const selected = selectDailyQuestions(fresh, { mode: "reading", states, seed: "s" });

    expect(selected).toHaveLength(10);
  });

  it("苦手度が同じなら、最後に出題されたのが古いものを先に出す", () => {
    const questions = ["子", "字", "学"].map((k, i) => question(`q-${i}`, k));
    const states = [
      weakState("子", 3, "2026-08-20T00:00:00.000Z"),
      weakState("字", 3, "2026-08-10T00:00:00.000Z"),
      weakState("学", 3, "2026-08-15T00:00:00.000Z"),
    ];
    const selected = selectDailyQuestions(questions, { mode: "reading", states, seed: "s", limit: 3 });

    expect(selected.map((item) => item.word)).toEqual(["字", "学", "子"]);
  });

  it("学年選択で候補を絞る", () => {
    const g3 = { ...question("g3", "山"), grade: 3 as const };
    const g4 = { ...question("g4", "海"), grade: 4 as const };
    const states = [state("山", 0, true, 0), state("海", 0, true, 0)];

    expect(selectDailyQuestions([g3, g4], { mode: "reading", states, grades: [3] }).map((q) => q.id)).toEqual(["g3"]);
    expect(selectDailyQuestions([g3, g4], { mode: "reading", states, grades: [4] }).map((q) => q.id)).toEqual(["g4"]);
    expect(selectDailyQuestions([g3, g4], { mode: "reading", states, grades: [3, 4] })).toHaveLength(2);
    expect(selectDailyQuestions([g3, g4], { mode: "reading", states, grades: [] })).toEqual([]);
  });

  it("未履修設定は学年選択より優先する", () => {
    // ADR-0009: 学年を選んでも、保護者が未履修にした漢字は出さない。
    const g4 = { ...question("g4", "海"), grade: 4 as const };
    const selected = selectDailyQuestions([g4], {
      mode: "reading",
      states: [state("海", 9, false, 0)],
      grades: [4],
    });

    expect(selected).toEqual([]);
  });

  it("未習漢字を除外し、苦手な問題を先に、残りを練習回数の少ない順に出す", () => {
    const selected = selectDailyQuestions(
      [question("easy", "山"), question("hard", "海"), question("unlearned", "川")],
      { mode: "reading", states: [state("山", 1, true, 0), state("海", 5, true, 3), state("川", 10, false)] },
    );
    // ADR-0008: 海 は苦手度5なので苦手枠へ入り、練習回数が多くても先に出る。
    expect(selected.map((item) => item.id)).toEqual(["hard", "easy"]);
    expect(selected.some((item) => item.id === "unlearned")).toBe(false);
  });

  it("同じ練習回数の候補は、開始シードでランダム順を作る", () => {
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
    expect(first).toMatchObject({ id: "2026-08-14:kanji:reading:1", currentIndex: 0 });
    expect(await getOrCreateDailySession(storage, questions, "reading", now)).toEqual(first);
    const second = await startNextDailyBatch(storage, questions, "reading", now, "second-press");
    expect(second).toMatchObject({ id: "2026-08-14:kanji:reading:2", currentIndex: 0 });
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
    subject: "kanji",
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
