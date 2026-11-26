import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, MAX_BACKUP_BYTES, parseBackup, summarizeBackup, type BackupFile } from "./backup";
import { StudyStorage, openStudyDatabase } from "./indexedDb";
import { createEmptyKanjiSkillStats, STORE_NAMES, STUDY_DB_VERSION } from "./schema";

type StoreName = typeof STORE_NAMES[keyof typeof STORE_NAMES];
const ALL_STORES = Object.values(STORE_NAMES) as StoreName[];

/**
 * Real databases hold records written by every earlier version of the app, so
 * the seed deliberately mixes current and legacy shapes. A backup that cannot
 * carry these back in would fail a parent exactly when they need it.
 */
const seed: Record<StoreName, unknown[]> = {
  attempts: [
    // Current kanji session attempt.
    {
      id: "a-1", sessionId: "2026-11-20:kanji:writing:1", sessionItemId: "2026-11-20:kanji:writing:1:item:1",
      questionId: "q-1", subject: "kanji", mode: "writing", answer: "植物", correct: true, mistakes: 1,
      usedGuide: false, answeredAt: "2026-11-20T10:00:00.000Z", targetKanji: ["植", "物"], firstTryCorrect: false,
      characterResults: [{ character: "植", mistakes: 1, usedGuide: false }, { character: "物", mistakes: 0, usedGuide: false }],
    },
    // Early attempt written before subject/sessionItemId existed.
    {
      id: "a-legacy", sessionId: "session-1", questionId: "kanji-writing-植物", mode: "writing", answer: "植物",
      correct: true, mistakes: 0, usedGuide: false, answeredAt: "2026-08-13T10:00:00.000Z",
    },
    // Units and map attempts.
    {
      id: "a-unit", sessionId: "2026-11-20:units:quiz:1", sessionItemId: "2026-11-20:units:quiz:1:item:1", questionId: "u-1",
      subject: "units", mode: "quiz", answer: "30", correct: true, mistakes: 0, usedGuide: false,
      answeredAt: "2026-11-20T11:00:00.000Z", unitStateKey: "length:conversion", firstTryCorrect: true,
    },
    {
      id: "a-map", sessionId: "2026-11-20:japan-map:quiz:1", sessionItemId: "2026-11-20:japan-map:quiz:1:item:1", questionId: "m-1",
      subject: "japan-map", mode: "quiz", answer: "tokyo", correct: false, mistakes: 1, usedGuide: false,
      answeredAt: "2026-11-20T12:00:00.000Z", firstTryCorrect: false,
    },
  ],
  kanjiStates: [
    { kanji: "植", learned: true, reading: createEmptyKanjiSkillStats(), writing: { ...createEmptyKanjiSkillStats(), weakness: 2 }, updatedAt: "2026-11-20T10:00:00.000Z" },
    // v1 record kept with its legacy fields after the v2 migration.
    { kanji: "物", learned: false, reading: createEmptyKanjiSkillStats(), writing: createEmptyKanjiSkillStats(), updatedAt: "2026-08-13T10:00:00.000Z", readingMastery: 2, writingMastery: 1, nextReviewAt: null },
  ],
  customQuestions: [],
  sessions: [
    // Written before DB v4: no subject.
    {
      id: "2026-08-20:kanji:reading:1", localDate: "2026-08-20", mode: "reading", batchNumber: 1, questionIds: ["q-1"],
      items: [{ id: "2026-08-20:kanji:reading:1:item:1", questionId: "q-1", status: "completed", mistakeCount: 0, usedGuide: false, impacts: {}, unknownKanji: [], completedAt: "2026-08-20T10:00:00.000Z" }],
      currentIndex: 1, startedAt: "2026-08-20T09:59:00.000Z", updatedAt: "2026-08-20T10:00:00.000Z", completedAt: "2026-08-20T10:00:00.000Z",
    },
    {
      id: "2026-11-20:japan-map:quiz:1", subject: "japan-map", localDate: "2026-11-20", mode: "quiz", batchNumber: 1, questionIds: ["m-1"],
      items: [{ id: "2026-11-20:japan-map:quiz:1:item:1", questionId: "m-1", status: "in-progress", mistakeCount: 1, usedGuide: false, impacts: {}, unknownKanji: [], completedAt: null }],
      currentIndex: 0, startedAt: "2026-11-20T11:59:00.000Z", updatedAt: "2026-11-20T12:00:00.000Z", completedAt: null,
    },
  ],
  settings: [
    { id: "grades", grades: [4], updatedAt: "2026-11-01T00:00:00.000Z" },
    { id: "units", unlearnedGroups: ["area:4"], updatedAt: "2026-11-01T00:00:00.000Z" },
  ],
  // v3 state: two pets finished and no active pet yet. Only normalisation on
  // read turns this into the third pet, so the raw record must survive as is.
  motivation: [
    { id: "app", pointsBalance: 12, activePetSpecies: null, activePetInvestedPoints: 0, completedPets: [{ species: "hiyoko", completedAt: "2026-09-01T00:00:00.000Z" }, { species: "usagi", completedAt: "2026-10-01T00:00:00.000Z" }], lastAnsweredAt: "2026-11-20T12:00:00.000Z", updatedAt: "2026-11-20T12:00:00.000Z" },
  ],
  unitStates: [
    { key: "length:conversion", presentations: 1, firstTryCorrect: 1, mistakePresentations: 0, unknownCount: 0, weakness: 0, lastPresentedAt: "2026-11-20T11:00:00.000Z", lastFirstTryCorrectAt: "2026-11-20T11:00:00.000Z", updatedAt: "2026-11-20T11:00:00.000Z" },
  ],
};

async function seedDatabase(factory: IDBFactory, name: string, records: Record<StoreName, unknown[]>) {
  const database = await openStudyDatabase(factory, name);
  const transaction = database.transaction(ALL_STORES, "readwrite");
  for (const store of ALL_STORES) for (const record of records[store]) transaction.objectStore(store).put(record);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function readAll(factory: IDBFactory, name: string): Promise<Record<StoreName, unknown[]>> {
  const database = await openStudyDatabase(factory, name);
  const transaction = database.transaction(ALL_STORES, "readonly");
  const entries = await Promise.all(ALL_STORES.map((store) => new Promise<[StoreName, unknown[]]>((resolve, reject) => {
    const request = transaction.objectStore(store).getAll();
    request.onsuccess = () => resolve([store, request.result]);
    request.onerror = () => reject(request.error);
  })));
  database.close();
  return Object.fromEntries(entries) as Record<StoreName, unknown[]>;
}

const NOW = new Date("2026-11-26T12:00:00.000Z");

describe("バックアップと復元", () => {
  let factory: IDBFactory;

  beforeEach(() => {
    factory = new IDBFactory();
  });

  async function exportedText(name = "source"): Promise<string> {
    await seedDatabase(factory, name, seed);
    const source = new StudyStorage(factory, name);
    const backup = await source.exportBackup(NOW);
    source.close();
    return JSON.stringify(backup);
  }

  it("全ストアを形式・DB版・書き出し日時つきで書き出す", async () => {
    const backup = JSON.parse(await exportedText()) as BackupFile;
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(backup.dbVersion).toBe(STUDY_DB_VERSION);
    expect(backup.exportedAt).toBe(NOW.toISOString());
    expect(Object.keys(backup.stores).sort()).toEqual([...ALL_STORES].sort());
    // Raw records, not the normalised values the screens read.
    expect(backup.stores.motivation).toEqual(seed.motivation);
    expect(backup.stores.settings).toEqual(expect.arrayContaining(seed.settings));
  });

  it("書き出したファイルを別の端末へ復元すると、古い形式の記録も含めて全データが一致する", async () => {
    const text = await exportedText();
    await seedDatabase(factory, "target", {
      ...Object.fromEntries(ALL_STORES.map((store) => [store, []])) as unknown as Record<StoreName, unknown[]>,
      attempts: [{ id: "only-on-target", sessionId: "s", questionId: "q", mode: "reading", answer: "", correct: false, mistakes: 0, usedGuide: false, answeredAt: "2026-11-25T00:00:00.000Z" }],
    });
    const target = new StudyStorage(factory, "target");
    await target.restoreBackup(parseBackup(text));
    target.close();

    expect(await readAll(factory, "target")).toEqual(await readAll(factory, "source"));
  });

  it("復元後のデータは画面からいつもどおり読める", async () => {
    const text = await exportedText();
    const target = new StudyStorage(factory, "target");
    await target.restoreBackup(parseBackup(text));
    expect((await target.listAttempts()).map((attempt) => attempt.id)).toEqual(["a-legacy", "a-1", "a-unit", "a-map"]);
    expect(await target.getGradeSettings()).toMatchObject({ grades: [4] });
    // The v3 state is still continued with the third pet when read.
    expect(await target.getMotivationState()).toMatchObject({ pointsBalance: 12, activePetSpecies: "kitsune" });
    target.close();
  });

  it("中身の件数・ポイント・育てた仲間を確認用にまとめる", async () => {
    const summary = summarizeBackup(parseBackup(await exportedText()));
    expect(summary).toEqual({
      exportedAt: NOW.toISOString(),
      attempts: 4,
      kanjiStates: 2,
      sessions: 2,
      pointsBalance: 12,
      completedPets: 2,
    });
  });

  describe("不正なファイルを拒否する（正しい書き出しに欠陥を1つだけ入れる）", () => {
    const mutate = async (change: (backup: Record<string, any>) => void): Promise<string> => {
      const backup = JSON.parse(await exportedText());
      change(backup);
      return JSON.stringify(backup);
    };

    it("JSONとして読めない", async () => {
      const text = await exportedText();
      expect(() => parseBackup(text.slice(0, -10))).toThrow("読み取れません");
    });
    it("このアプリの形式ではない", async () => {
      expect(() => parseBackup(JSON.stringify(seed))).toThrow("おさらいノートのバックアップではありません");
      expect(() => parseBackup(JSON.stringify(null))).toThrow("おさらいノートのバックアップではありません");
    });
    it("形式の印が違う", async () => {
      const text = await mutate((backup) => { backup.format = "other-app"; });
      expect(() => parseBackup(text)).toThrow("おさらいノートのバックアップではありません");
    });
    it("形式の版が違う", async () => {
      const text = await mutate((backup) => { backup.formatVersion = 2; });
      expect(() => parseBackup(text)).toThrow("形式の版");
    });
    it("DBの版が今と違う", async () => {
      const newer = await mutate((backup) => { backup.dbVersion = STUDY_DB_VERSION + 1; });
      expect(() => parseBackup(newer)).toThrow("版");
      const older = await mutate((backup) => { backup.dbVersion = STUDY_DB_VERSION - 1; });
      expect(() => parseBackup(older)).toThrow("版");
    });
    it("書き出し日時がない", async () => {
      const text = await mutate((backup) => { delete backup.exportedAt; });
      expect(() => parseBackup(text)).toThrow("書き出し日時");
    });
    it("データの種類が欠けている", async () => {
      const text = await mutate((backup) => { delete backup.stores.unitStates; });
      expect(() => parseBackup(text)).toThrow("unitStates");
    });
    it("知らないデータの種類がある", async () => {
      const text = await mutate((backup) => { backup.stores.extra = []; });
      expect(() => parseBackup(text)).toThrow("extra");
    });
    it("記録が一覧になっていない", async () => {
      const text = await mutate((backup) => { backup.stores.attempts = {}; });
      expect(() => parseBackup(text)).toThrow("attempts");
    });
    it("記録がオブジェクトではない", async () => {
      const text = await mutate((backup) => { backup.stores.attempts.push("a-2"); });
      expect(() => parseBackup(text)).toThrow("attempts");
    });
    it("記録のキーがない", async () => {
      const text = await mutate((backup) => { delete backup.stores.kanjiStates[0].kanji; });
      expect(() => parseBackup(text)).toThrow("kanjiStates");
    });
    it("同じキーの記録が2つある", async () => {
      const text = await mutate((backup) => { backup.stores.attempts.push({ ...backup.stores.attempts[0] }); });
      expect(() => parseBackup(text)).toThrow("重複");
    });
    it("ペットの育成順が壊れている", async () => {
      const text = await mutate((backup) => { backup.stores.motivation[0].completedPets[0].species = "kitsune"; });
      expect(() => parseBackup(text)).toThrow("ペット");
    });
    it("大きすぎる", () => {
      expect(() => parseBackup(" ".repeat(MAX_BACKUP_BYTES + 1))).toThrow("大きすぎ");
    });
  });

  it("置き換えの途中で保存に失敗したら、元のデータを1件も変えない", async () => {
    const text = await exportedText();
    await seedDatabase(factory, "target", seed);
    const before = await readAll(factory, "target");
    const backup = parseBackup(text);
    // Passes validation but cannot be stored: IndexedDB cannot clone a function.
    (backup.stores.unitStates[0] as Record<string, unknown>).broken = () => undefined;

    const target = new StudyStorage(factory, "target");
    await expect(target.restoreBackup(backup)).rejects.toBeTruthy();
    target.close();
    expect(await readAll(factory, "target")).toEqual(before);
  });

  it("初期化で全データを消し、学年などは初期値に戻る", async () => {
    await seedDatabase(factory, "target", seed);
    const target = new StudyStorage(factory, "target");
    await target.resetAllData();
    expect(await readAll(factory, "target")).toEqual(Object.fromEntries(ALL_STORES.map((store) => [store, []])));
    expect(await target.getGradeSettings()).toMatchObject({ grades: [3, 4] });
    expect(await target.getMotivationState()).toMatchObject({ pointsBalance: 0, activePetSpecies: "hiyoko" });
    target.close();
  });
});
