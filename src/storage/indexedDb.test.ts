import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { StudyStorage, openStudyDatabase } from "./indexedDb";
import { createEmptyKanjiSkillStats, STORE_NAMES, STUDY_DB_VERSION, type MotivationState, type StudyAttempt } from "./schema";

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
      reading: createEmptyKanjiSkillStats(),
      writing: createEmptyKanjiSkillStats(),
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
        reading: createEmptyKanjiSkillStats(),
        writing: createEmptyKanjiSkillStats(),
        updatedAt: "2026-08-13T10:00:00.000Z",
      },
      {
        kanji: "物",
        learned: false,
        reading: createEmptyKanjiSkillStats(),
        writing: createEmptyKanjiSkillStats(),
        updatedAt: "2026-08-13T10:00:00.000Z",
      },
    ]);

    expect(await storage.listKanjiStates()).toHaveLength(2);
    expect(await storage.getKanjiState("物")).toMatchObject({ learned: false });
  });

  it("v1の回答と履修状態を保持してv2へ移行する", async () => {
    const name = "migration-test";
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(name, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore(STORE_NAMES.attempts, { keyPath: "id" });
        database.createObjectStore(STORE_NAMES.kanjiStates, { keyPath: "kanji" });
        database.createObjectStore(STORE_NAMES.customQuestions, { keyPath: "id" });
        database.createObjectStore(STORE_NAMES.sessions, { keyPath: "id" });
        database.createObjectStore(STORE_NAMES.settings, { keyPath: "id" });
        request.transaction?.objectStore(STORE_NAMES.attempts).add(attempt);
        request.transaction?.objectStore(STORE_NAMES.kanjiStates).add({
          kanji: "植",
          learned: false,
          readingMastery: 3,
          writingMastery: 2,
          nextReviewAt: "2026-08-14T00:00:00.000Z",
          updatedAt: "2026-08-13T10:00:00.000Z",
        });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const database = await openStudyDatabase(factory, name);
    expect(database.version).toBe(STUDY_DB_VERSION);
    const transaction = database.transaction(
      [STORE_NAMES.attempts, STORE_NAMES.kanjiStates, STORE_NAMES.sessions],
      "readonly",
    );
    const migratedAttempt = await new Promise<StudyAttempt>((resolve, reject) => {
      const request = transaction.objectStore(STORE_NAMES.attempts).get(attempt.id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const migratedState = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = transaction.objectStore(STORE_NAMES.kanjiStates).get("植");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    expect(migratedAttempt).toEqual(attempt);
    expect(migratedState).toMatchObject({
      kanji: "植",
      learned: false,
      readingMastery: 3,
      writingMastery: 2,
      reading: { weakness: 0, presentations: 0 },
      writing: { weakness: 0, presentations: 0 },
    });
    expect(Array.from(transaction.objectStore(STORE_NAMES.sessions).indexNames)).toEqual([
      "localDate",
      "localDateMode",
    ]);
    expect(database.objectStoreNames.contains(STORE_NAMES.motivation)).toBe(true);
    database.close();
  });

  it("同じ当日セッションは冪等に作成し、別内容で上書きしない", async () => {
    const dailySession = createSession("reading", ["question-1"]);

    expect(await storage.createDailySession(dailySession)).toBe("added");
    expect(await storage.createDailySession(dailySession)).toBe("duplicate");
    await expect(storage.createDailySession({ ...dailySession, batchNumber: 2 })).rejects.toThrow("別の内容");
    expect(await storage.getDailySession(dailySession.id)).toEqual(dailySession);
  });

  it("読みの最初の誤答を全対象漢字へ一度だけ加算し、正解で相殺しない", async () => {
    const dailySession = createSession("reading", ["kanji-reading-植物"]);
    await storage.createDailySession(dailySession);
    const wrong = createSessionAttempt({
      id: "reading-wrong-1",
      sessionId: dailySession.id,
      sessionItemId: dailySession.items[0].id,
      questionId: "kanji-reading-植物",
      mode: "reading",
      answer: "しょくもの",
      correct: false,
      mistakes: 1,
      firstTryCorrect: false,
      targetKanji: ["植", "物"],
    });

    expect(await storage.recordKanjiSessionAttempt(wrong)).toBe("added");
    expect(await storage.recordKanjiSessionAttempt(wrong)).toBe("duplicate");
    await storage.recordKanjiSessionAttempt({
      ...wrong,
      id: "reading-correct-1",
      answer: "しょくぶつ",
      correct: true,
      mistakes: 0,
      answeredAt: "2026-08-14T10:01:00.000Z",
    });

    expect(await storage.getKanjiState("植")).toMatchObject({
      reading: { weakness: 1, presentations: 1, mistakePresentations: 1, firstTryCorrect: 0 },
    });
    expect(await storage.getKanjiState("物")).toMatchObject({
      reading: { weakness: 1, presentations: 1, mistakePresentations: 1, firstTryCorrect: 0 },
    });
    expect(await storage.listAttempts()).toHaveLength(2);
    expect(await storage.getDailySession(dailySession.id)).toMatchObject({
      currentIndex: 1,
      completedAt: "2026-08-14T10:01:00.000Z",
      items: [{ status: "completed", mistakeCount: 1 }],
    });
  });

  it("初回正解で読み苦手度を下限0まで減らす", async () => {
    await storage.saveKanjiState(createKanjiState("葉", true, 1, 0));
    const dailySession = createSession("reading", ["kanji-reading-葉"]);
    await storage.createDailySession(dailySession);

    await storage.recordKanjiSessionAttempt(createSessionAttempt({
      id: "reading-clean-1",
      sessionId: dailySession.id,
      sessionItemId: dailySession.items[0].id,
      questionId: "kanji-reading-葉",
      mode: "reading",
      answer: "は",
      correct: true,
      mistakes: 0,
      firstTryCorrect: true,
      targetKanji: ["葉"],
    }));

    expect(await storage.getKanjiState("葉")).toMatchObject({
      reading: { weakness: 0, presentations: 1, firstTryCorrect: 1 },
    });
  });

  it("読みの分からないを未知として一度だけ記録し、後の正解で相殺しない", async () => {
    const dailySession = createSession("reading", ["kanji-reading-暗"]);
    await storage.createDailySession(dailySession);
    await storage.recordKanjiSessionAttempt(createSessionAttempt({
      id: "reading-unknown",
      sessionId: dailySession.id,
      sessionItemId: dailySession.items[0].id,
      questionId: "kanji-reading-暗",
      mode: "reading",
      answer: "",
      correct: false,
      mistakes: 1,
      usedGuide: true,
      firstTryCorrect: false,
      targetKanji: ["暗"],
    }));
    await storage.recordKanjiSessionAttempt(createSessionAttempt({
      id: "reading-after-guide",
      sessionId: dailySession.id,
      sessionItemId: dailySession.items[0].id,
      questionId: "kanji-reading-暗",
      mode: "reading",
      answer: "くら",
      correct: true,
      mistakes: 0,
      usedGuide: true,
      firstTryCorrect: false,
      targetKanji: ["暗"],
      answeredAt: "2026-08-14T10:01:00.000Z",
    }));

    expect(await storage.getKanjiState("暗")).toMatchObject({
      reading: { presentations: 1, mistakePresentations: 1, weakness: 1, unknownCount: 1 },
    });
    expect(await storage.getDailySession(dailySession.id)).toMatchObject({
      currentIndex: 1,
      items: [{ status: "completed", mistakeCount: 1, usedGuide: true, unknownKanji: ["暗"] }],
    });
  });

  it("書き問題は文字別結果だけを各漢字へ反映する", async () => {
    const dailySession = createSession("writing", ["kanji-writing-植物"]);
    await storage.createDailySession(dailySession);

    await storage.recordKanjiSessionAttempt(createSessionAttempt({
      id: "writing-result-1",
      sessionId: dailySession.id,
      sessionItemId: dailySession.items[0].id,
      questionId: "kanji-writing-植物",
      mode: "writing",
      answer: "植物",
      correct: true,
      mistakes: 2,
      usedGuide: true,
      firstTryCorrect: false,
      targetKanji: ["植", "物"],
      characterResults: [
        { character: "植", mistakes: 2, usedGuide: true },
        { character: "物", mistakes: 0, usedGuide: false },
      ],
    }));

    expect(await storage.getKanjiState("植")).toMatchObject({
      writing: { weakness: 1, mistakePresentations: 1, unknownCount: 1, strokeMistakes: 2 },
    });
    expect(await storage.getKanjiState("物")).toMatchObject({
      writing: { weakness: 0, firstTryCorrect: 1, strokeMistakes: 0 },
    });
  });

  it("順番外の回答が失敗した場合は回答・進捗・集計を一切変更しない", async () => {
    const dailySession = createSession("reading", ["question-1", "question-2"]);
    await storage.createDailySession(dailySession);

    await expect(storage.recordKanjiSessionAttempt(createSessionAttempt({
      id: "out-of-order",
      sessionId: dailySession.id,
      sessionItemId: dailySession.items[1].id,
      questionId: "question-2",
      mode: "reading",
      answer: "もの",
      correct: true,
      mistakes: 0,
      firstTryCorrect: true,
      targetKanji: ["物"],
    }))).rejects.toThrow("現在の問題ではありません");

    expect(await storage.listAttempts()).toEqual([]);
    expect(await storage.getKanjiState("物")).toBeUndefined();
    expect(await storage.getDailySession(dailySession.id)).toEqual(dailySession);
  });

  it("同じ回答IDの別内容を拒否し、既存の進捗と集計を維持する", async () => {
    const dailySession = createSession("reading", ["kanji-reading-葉"]);
    await storage.createDailySession(dailySession);
    const wrong = createSessionAttempt({
      id: "conflicting-attempt",
      sessionId: dailySession.id,
      sessionItemId: dailySession.items[0].id,
      questionId: "kanji-reading-葉",
      mode: "reading",
      answer: "ば",
      correct: false,
      mistakes: 1,
      firstTryCorrect: false,
      targetKanji: ["葉"],
    });
    await storage.recordKanjiSessionAttempt(wrong);
    const stateBefore = await storage.getKanjiState("葉");
    const sessionBefore = await storage.getDailySession(dailySession.id);

    await expect(storage.recordKanjiSessionAttempt({ ...wrong, answer: "ぱ" })).rejects.toThrow("別の内容");

    expect(await storage.listAttempts()).toEqual([wrong]);
    expect(await storage.getKanjiState("葉")).toEqual(stateBefore);
    expect(await storage.getDailySession(dailySession.id)).toEqual(sessionBefore);
  });

  it("苦手度を上限10より増やさない", async () => {
    await storage.saveKanjiState(createKanjiState("葉", true, 10, 0));
    const dailySession = createSession("reading", ["kanji-reading-葉"]);
    await storage.createDailySession(dailySession);

    await storage.recordKanjiSessionAttempt(createSessionAttempt({
      id: "reading-at-cap",
      sessionId: dailySession.id,
      sessionItemId: dailySession.items[0].id,
      questionId: "kanji-reading-葉",
      mode: "reading",
      answer: "ば",
      correct: false,
      mistakes: 1,
      firstTryCorrect: false,
      targetKanji: ["葉"],
    }));

    expect(await storage.getKanjiState("葉")).toMatchObject({ reading: { weakness: 10 } });
  });

  it("自由練習の結果を今日のセッションを作らず苦手度へ反映する", async () => {
    const attempt = createFreePracticeAttempt({
      id: "free-reading-1",
      questionId: "kanji-reading-dark",
      answer: "くらい",
      mistakes: 1,
      firstTryCorrect: false,
      usedGuide: true,
      targetKanji: ["暗"],
    });
    expect(await storage.recordKanjiFreePracticeAttempt(attempt)).toBe("added");
    expect(await storage.recordKanjiFreePracticeAttempt(attempt)).toBe("duplicate");
    expect(await storage.listDailySessions("2026-08-14")).toEqual([]);
    expect(await storage.listAttempts()).toEqual([attempt]);
    expect(await storage.getKanjiState("暗")).toMatchObject({
      reading: { presentations: 1, mistakePresentations: 1, weakness: 1, unknownCount: 1 },
    });
  });

  it("自由練習は未履修漢字を回答確定時にも拒否し全更新を戻す", async () => {
    await storage.saveKanjiState(createKanjiState("暗", false, 0, 0));
    const before = await storage.getKanjiState("暗");
    await expect(storage.recordKanjiFreePracticeAttempt(createFreePracticeAttempt({
      id: "free-unlearned",
      questionId: "kanji-reading-dark",
      answer: "くらい",
      targetKanji: ["暗"],
    }))).rejects.toThrow("未履修");
    expect(await storage.listAttempts()).toEqual([]);
    expect(await storage.getKanjiState("暗")).toEqual(before);
  });

  it("自由練習で同じ回答IDの別内容を拒否し二重計上しない", async () => {
    const attempt = createFreePracticeAttempt({ id: "free-conflict" });
    await storage.recordKanjiFreePracticeAttempt(attempt);
    const before = await storage.getKanjiState("葉");
    await expect(storage.recordKanjiFreePracticeAttempt({ ...attempt, answer: "ば" })).rejects.toThrow("別の内容");
    expect(await storage.getKanjiState("葉")).toEqual(before);
    expect(await storage.listAttempts()).toHaveLength(1);
  });

  it("未保存の状態ではポイント0・最初のペットの初期状態を返す", async () => {
    expect(await storage.getMotivationState()).toMatchObject({
      pointsBalance: 0,
      activePetSpecies: "hiyoko",
      activePetInvestedPoints: 0,
      completedPets: [],
      lastAnsweredAt: null,
    });
  });

  it("当日セッションの回答は正誤や分からないによらず1問1ポイントを加算する", async () => {
    const dailySession = createSession("reading", ["kanji-reading-葉"]);
    await storage.createDailySession(dailySession);
    await storage.recordKanjiSessionAttempt(createSessionAttempt({
      id: "reading-points-1",
      sessionId: dailySession.id,
      sessionItemId: dailySession.items[0].id,
      questionId: "kanji-reading-葉",
      mode: "reading",
      answer: "は",
      correct: false,
      mistakes: 1,
      firstTryCorrect: false,
      targetKanji: ["葉"],
      answeredAt: "2026-08-14T10:00:30.000Z",
    }));

    expect(await storage.getMotivationState()).toMatchObject({
      pointsBalance: 1,
      lastAnsweredAt: "2026-08-14T10:00:30.000Z",
    });
  });

  it("同じ回答IDの重複保存ではポイントを二重加算しない", async () => {
    const attempt = createFreePracticeAttempt({ id: "free-points-dup" });
    expect(await storage.recordKanjiFreePracticeAttempt(attempt)).toBe("added");
    expect(await storage.recordKanjiFreePracticeAttempt(attempt)).toBe("duplicate");

    expect(await storage.getMotivationState()).toMatchObject({ pointsBalance: 1 });
  });

  it("自由練習の回答でもポイントを加算する", async () => {
    await storage.recordKanjiFreePracticeAttempt(createFreePracticeAttempt({ id: "free-points-1" }));

    expect(await storage.getMotivationState()).toMatchObject({ pointsBalance: 1 });
  });

  it("エサをあげるとポイントを消費し育成ポイントが増える", async () => {
    await storage.recordKanjiFreePracticeAttempt(createFreePracticeAttempt({ id: "free-feed-1" }));
    await storage.recordKanjiFreePracticeAttempt(createFreePracticeAttempt({
      id: "free-feed-2",
      answeredAt: "2026-08-14T10:02:00.000Z",
    }));

    const state = await storage.feedPet(1, "2026-08-14T10:03:00.000Z");

    expect(state).toMatchObject({
      pointsBalance: 1,
      activePetSpecies: "hiyoko",
      activePetInvestedPoints: 1,
    });
  });

  it("ポイントが足りないとエサをあげられない", async () => {
    await expect(storage.feedPet(1, "2026-08-14T10:03:00.000Z")).rejects.toThrow("ポイントが足りません");
  });

  it("1匹分のポイントを満たすと次のペットへ切り替わる", async () => {
    await seedMotivationState(factory, "study-support-test", {
      id: "app",
      pointsBalance: 5,
      activePetSpecies: "hiyoko",
      activePetInvestedPoints: 495,
      completedPets: [],
      lastAnsweredAt: "2026-08-14T10:00:00.000Z",
      updatedAt: "2026-08-14T10:00:00.000Z",
    });

    const state = await storage.feedPet(5, "2026-08-14T11:00:00.000Z");

    expect(state.pointsBalance).toBe(0);
    expect(state.activePetInvestedPoints).toBe(0);
    expect(state.activePetSpecies).toBe("usagi");
    expect(state.completedPets).toEqual([{ species: "hiyoko", completedAt: "2026-08-14T11:00:00.000Z" }]);
  });

  it("最後の1匹まで育て終えるとこれ以上エサをあげられない", async () => {
    await seedMotivationState(factory, "study-support-test", {
      id: "app",
      pointsBalance: 5,
      activePetSpecies: null,
      activePetInvestedPoints: 0,
      completedPets: [
        { species: "hiyoko", completedAt: "2026-08-14T10:00:00.000Z" },
        { species: "usagi", completedAt: "2026-08-14T10:30:00.000Z" },
      ],
      lastAnsweredAt: "2026-08-14T10:30:00.000Z",
      updatedAt: "2026-08-14T10:30:00.000Z",
    });

    await expect(storage.feedPet(1, "2026-08-14T11:00:00.000Z")).rejects.toThrow("これ以上育てられるペットがいません");
  });
});

async function seedMotivationState(factory: IDBFactory, name: string, state: MotivationState): Promise<void> {
  const database = await openStudyDatabase(factory, name);
  const transaction = database.transaction(STORE_NAMES.motivation, "readwrite");
  transaction.objectStore(STORE_NAMES.motivation).put(state);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

function createSession(mode: "reading" | "writing", questionIds: string[]) {
  return {
    id: `2026-08-14:${mode}:1`,
    localDate: "2026-08-14",
    mode,
    batchNumber: 1,
    questionIds,
    items: questionIds.map((questionId, index) => ({
      id: `item-${index + 1}`,
      questionId,
      status: "pending" as const,
      mistakeCount: 0,
      usedGuide: false,
      impacts: {},
      unknownKanji: [],
      completedAt: null,
    })),
    currentIndex: 0,
    startedAt: "2026-08-14T10:00:00.000Z",
    updatedAt: "2026-08-14T10:00:00.000Z",
    completedAt: null,
  };
}

function createSessionAttempt(overrides: Record<string, unknown>) {
  return {
    id: "session-attempt",
    sessionId: "session",
    sessionItemId: "item-1",
    questionId: "question",
    subject: "kanji" as const,
    mode: "reading" as const,
    answer: "",
    correct: false,
    mistakes: 0,
    usedGuide: false,
    firstTryCorrect: false,
    targetKanji: ["葉"],
    answeredAt: overrides.correct ? "2026-08-14T10:01:00.000Z" : "2026-08-14T10:00:30.000Z",
    ...overrides,
  };
}

function createFreePracticeAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "free-attempt",
    sessionId: "free-practice" as const,
    questionId: "kanji-reading-leaf",
    subject: "kanji" as const,
    mode: "reading" as const,
    answer: "は",
    correct: true,
    mistakes: 0,
    usedGuide: false,
    firstTryCorrect: true,
    targetKanji: ["葉"],
    answeredAt: "2026-08-14T10:01:00.000Z",
    ...overrides,
  };
}

function createKanjiState(kanji: string, learned: boolean, readingWeakness: number, writingWeakness: number) {
  const stats = (weakness: number) => ({
    presentations: 0,
    firstTryCorrect: 0,
    mistakePresentations: 0,
    unknownCount: 0,
    strokeMistakes: 0,
    weakness,
    lastPresentedAt: null,
    lastFirstTryCorrectAt: null,
  });
  return {
    kanji,
    learned,
    reading: stats(readingWeakness),
    writing: stats(writingWeakness),
    updatedAt: "2026-08-14T09:00:00.000Z",
  };
}
