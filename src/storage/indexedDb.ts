import {
  STORE_NAMES,
  STUDY_DB_NAME,
  STUDY_DB_VERSION,
  type AppSettings,
  type KanjiState,
  type SaveAttemptResult,
  type StudyAttempt,
} from "./schema";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sameRecord(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function assertAllowedKeys(value: object, allowed: readonly string[], label: string): void {
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length > 0) {
    throw new Error(`${label}に保存対象外の項目があります: ${unsupported.join(", ")}`);
  }
}

function validateAttempt(attempt: StudyAttempt): void {
  assertAllowedKeys(attempt, [
    "id", "sessionId", "questionId", "subject", "mode", "answer", "correct",
    "mistakes", "usedGuide", "answeredAt", "characterResults",
  ], "回答");

  if (!attempt.id || !attempt.sessionId || !attempt.questionId || !attempt.answeredAt) {
    throw new Error("回答の識別情報が不足しています");
  }
  if (!Number.isInteger(attempt.mistakes) || attempt.mistakes < 0) {
    throw new Error("ミス回数が不正です");
  }
  attempt.characterResults?.forEach((result) => {
    assertAllowedKeys(result, ["character", "mistakes", "usedGuide"], "文字別結果");
    if (!Number.isInteger(result.mistakes) || result.mistakes < 0) {
      throw new Error("文字別のミス回数が不正です");
    }
  });
}

export function openStudyDatabase(
  factory: IDBFactory = indexedDB,
  name = STUDY_DB_NAME,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, STUDY_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAMES.attempts)) {
        const attempts = database.createObjectStore(STORE_NAMES.attempts, { keyPath: "id" });
        attempts.createIndex("answeredAt", "answeredAt");
        attempts.createIndex("questionId", "questionId");
        attempts.createIndex("sessionId", "sessionId");
      }

      if (!database.objectStoreNames.contains(STORE_NAMES.kanjiStates)) {
        database.createObjectStore(STORE_NAMES.kanjiStates, { keyPath: "kanji" });
      }

      if (!database.objectStoreNames.contains(STORE_NAMES.customQuestions)) {
        database.createObjectStore(STORE_NAMES.customQuestions, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(STORE_NAMES.sessions)) {
        database.createObjectStore(STORE_NAMES.sessions, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(STORE_NAMES.settings)) {
        database.createObjectStore(STORE_NAMES.settings, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("学習データベースを開けませんでした"));
    request.onblocked = () => reject(new Error("別の画面が学習データベースを使用中です"));
  });
}

export class StudyStorage {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory?: IDBFactory,
    private readonly databaseName = STUDY_DB_NAME,
  ) {}

  private database(): Promise<IDBDatabase> {
    const factory = this.factory ?? globalThis.indexedDB;
    if (!factory) return Promise.reject(new Error("このブラウザでは端末内保存を利用できません"));
    this.databasePromise ??= openStudyDatabase(factory, this.databaseName);
    return this.databasePromise;
  }

  async saveAttempt(attempt: StudyAttempt): Promise<SaveAttemptResult> {
    validateAttempt(attempt);
    const database = await this.database();
    const transaction = database.transaction(STORE_NAMES.attempts, "readwrite");
    const completion = transactionComplete(transaction);

    try {
      await requestResult(transaction.objectStore(STORE_NAMES.attempts).add(attempt));
      await completion;
      return "added";
    } catch (error) {
      await completion.catch(() => undefined);
      if (!(error instanceof DOMException) || error.name !== "ConstraintError") throw error;

      const existing = await this.getAttempt(attempt.id);
      if (existing && sameRecord(existing, attempt)) return "duplicate";
      throw new Error(`回答ID ${attempt.id} は別の内容です`);
    }
  }

  async getAttempt(id: string): Promise<StudyAttempt | undefined> {
    const database = await this.database();
    const transaction = database.transaction(STORE_NAMES.attempts, "readonly");
    const result = await requestResult(
      transaction.objectStore(STORE_NAMES.attempts).get(id) as IDBRequest<StudyAttempt | undefined>,
    );
    await transactionComplete(transaction);
    return result;
  }

  async listAttempts(): Promise<StudyAttempt[]> {
    const database = await this.database();
    const transaction = database.transaction(STORE_NAMES.attempts, "readonly");
    const result = await requestResult(
      transaction.objectStore(STORE_NAMES.attempts).index("answeredAt").getAll() as IDBRequest<StudyAttempt[]>,
    );
    await transactionComplete(transaction);
    return result;
  }

  async saveKanjiState(state: KanjiState): Promise<void> {
    await this.put(STORE_NAMES.kanjiStates, state);
  }

  async saveKanjiStates(states: KanjiState[]): Promise<void> {
    if (states.length === 0) return;
    const database = await this.database();
    const transaction = database.transaction(STORE_NAMES.kanjiStates, "readwrite");
    const completion = transactionComplete(transaction);
    const store = transaction.objectStore(STORE_NAMES.kanjiStates);
    await Promise.all(states.map((state) => requestResult(store.put(state))));
    await completion;
  }

  async getKanjiState(kanji: string): Promise<KanjiState | undefined> {
    return this.get<KanjiState>(STORE_NAMES.kanjiStates, kanji);
  }

  async listKanjiStates(): Promise<KanjiState[]> {
    const database = await this.database();
    const transaction = database.transaction(STORE_NAMES.kanjiStates, "readonly");
    const result = await requestResult(
      transaction.objectStore(STORE_NAMES.kanjiStates).getAll() as IDBRequest<KanjiState[]>,
    );
    await transactionComplete(transaction);
    return result;
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.put(STORE_NAMES.settings, settings);
  }

  async getSettings(): Promise<AppSettings | undefined> {
    return this.get<AppSettings>(STORE_NAMES.settings, "app");
  }

  close(): void {
    void this.databasePromise?.then((database) => database.close());
    this.databasePromise = null;
  }

  private async put(storeName: string, value: unknown): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(storeName, "readwrite");
    const completion = transactionComplete(transaction);
    await requestResult(transaction.objectStore(storeName).put(value));
    await completion;
  }

  private async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    const database = await this.database();
    const transaction = database.transaction(storeName, "readonly");
    const result = await requestResult(
      transaction.objectStore(storeName).get(key) as IDBRequest<T | undefined>,
    );
    await transactionComplete(transaction);
    return result;
  }
}

export const studyStorage = new StudyStorage();
