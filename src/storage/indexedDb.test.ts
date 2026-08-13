import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { StudyStorage, openStudyDatabase } from "./indexedDb";
import { STORE_NAMES, type StudyAttempt } from "./schema";

const attempt: StudyAttempt = {
  id: "attempt-1",
  sessionId: "session-1",
  questionId: "kanji-writing-植物",
  subject: "kanji",
  mode: "writing",
  answer: "植物",
  correct: true,
  mistakes: 1,
  usedGuide: false,
  answeredAt: "2026-08-13T10:00:00.000Z",
  characterResults: [
    { character: "植", mistakes: 1, usedGuide: false },
    { character: "物", mistakes: 0, usedGuide: false },
  ],
};

describe("StudyStorage", () => {
  let factory: IDBFactory;
  let storage: StudyStorage;

  beforeEach(() => {
    factory = new IDBFactory();
    storage = new StudyStorage(factory, "study-support-test");
  });

  it("初回起動で必要なストアと回答索引を作る", async () => {
    const database = await openStudyDatabase(factory, "schema-test");

    expect(Array.from(database.objectStoreNames)).toEqual(
      expect.arrayContaining(Object.values(STORE_NAMES)),
    );

    const transaction = database.transaction(STORE_NAMES.attempts, "readonly");
    expect(Array.from(transaction.objectStore(STORE_NAMES.attempts).indexNames)).toEqual([
      "answeredAt",
      "questionId",
      "sessionId",
    ]);
    database.close();
  });

  it("回答を保存して日時順に読み出す", async () => {
    await storage.saveAttempt(attempt);
    await storage.saveAttempt({
      ...attempt,
      id: "attempt-2",
      answeredAt: "2026-08-13T11:00:00.000Z",
    });

    expect(await storage.getAttempt("attempt-1")).toEqual(attempt);
    expect((await storage.listAttempts()).map((item) => item.id)).toEqual([
      "attempt-1",
      "attempt-2",
    ]);
  });

  it("同じIDと内容の再保存を重複させない", async () => {
    expect(await storage.saveAttempt(attempt)).toBe("added");
    expect(await storage.saveAttempt(attempt)).toBe("duplicate");
    expect(await storage.listAttempts()).toHaveLength(1);
  });

  it("同じIDを異なる回答で上書きしない", async () => {
    await storage.saveAttempt(attempt);

    await expect(
      storage.saveAttempt({ ...attempt, mistakes: 9 }),
    ).rejects.toThrow("別の内容です");
    expect(await storage.getAttempt(attempt.id)).toEqual(attempt);
  });

  it("生の筆跡や筆圧など保存対象外の項目を拒否する", async () => {
    const unsafeAttempt = { ...attempt, pressure: [0.2, 0.8] } as StudyAttempt;

    await expect(storage.saveAttempt(unsafeAttempt)).rejects.toThrow("保存対象外");
    expect(await storage.listAttempts()).toEqual([]);
  });

  it("履修状態と設定は同じキーの最新値へ更新する", async () => {
    const initialState = {
      kanji: "植",
      learned: false,
      readingMastery: 0,
      writingMastery: 0,
      nextReviewAt: null,
      updatedAt: "2026-08-13T10:00:00.000Z",
    };
    await storage.saveKanjiState(initialState);
    await storage.saveKanjiState({
      ...initialState,
      learned: true,
      updatedAt: "2026-08-13T11:00:00.000Z",
    });
    await storage.saveSettings({
      id: "app",
      dailyQuestionCount: 10,
      updatedAt: "2026-08-13T11:00:00.000Z",
    });

    expect(await storage.getKanjiState("植")).toMatchObject({ learned: true });
    expect(await storage.getSettings()).toMatchObject({ dailyQuestionCount: 10 });
    expect(await storage.listAttempts()).toEqual([]);
  });

  it("複数の履修状態を1回の操作で保存する", async () => {
    await storage.saveKanjiStates([
      {
        kanji: "植",
        learned: true,
        readingMastery: 0,
        writingMastery: 0,
        nextReviewAt: null,
        updatedAt: "2026-08-13T10:00:00.000Z",
      },
      {
        kanji: "物",
        learned: false,
        readingMastery: 0,
        writingMastery: 0,
        nextReviewAt: null,
        updatedAt: "2026-08-13T10:00:00.000Z",
      },
    ]);

    expect(await storage.listKanjiStates()).toHaveLength(2);
    expect(await storage.getKanjiState("物")).toMatchObject({ learned: false });
  });
});
