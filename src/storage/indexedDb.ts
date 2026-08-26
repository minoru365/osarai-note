import {
  FOOD_COSTS,
  PET_SPECIES,
  POINTS_TO_COMPLETE_PET,
  STORE_NAMES,
  STUDY_DB_NAME,
  STUDY_DB_VERSION,
  createEmptyKanjiSkillStats,
  createEmptyUnitState,
  createInitialMotivationState,
  type AppSettings,
  isSubject,
  isUnitSession,
  type DailyKanjiSession,
  type DailySessionItem,
  type DailyStudySession,
  type DailyUnitSession,
  type FoodCost,
  type KanjiState,
  type KanjiFreePracticeAttempt,
  type KanjiSessionAttempt,
  type KanjiSkillStats,
  type KanjiStudyMode,
  type MotivationState,
  type SaveAttemptResult,
  type SkillImpact,
  type StudyAttempt,
  type Subject,
  type UnitLearningSettings,
  type UnitSessionAttempt,
  type UnitSessionItem,
  type UnitState,
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
    "mistakes", "usedGuide", "answeredAt", "characterResults", "sessionItemId",
    "targetKanji", "firstTryCorrect", "unitStateKey",
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

// Records written before DB v4 have no `subject`; they are all kanji (ADR-0007).
function normalizeDailySession(stored: DailyStudySession): DailyStudySession {
  const session = stored as DailyStudySession & { subject?: Subject };
  if (session.subject) return session as DailyStudySession;
  return { ...(session as DailyKanjiSession), subject: "kanji" };
}

function validateDailySession(session: DailyStudySession): void {
  if (!session.id || !/^\d{4}-\d{2}-\d{2}$/.test(session.localDate)) {
    throw new Error("当日セッションの識別情報が不正です");
  }
  if (!isSubject(session.subject)) {
    throw new Error("当日セッションの教科が不正です");
  }
  const modeAllowed = session.subject === "kanji"
    ? session.mode === "reading" || session.mode === "writing"
    : session.mode === "quiz";
  if (!modeAllowed
    || !Number.isInteger(session.batchNumber) || session.batchNumber < 1
    || session.questionIds.length === 0
    || session.questionIds.length !== session.items.length
    || session.currentIndex < 0 || session.currentIndex > session.items.length) {
    throw new Error("当日セッションの進行情報が不正です");
  }
  const itemIds = new Set<string>();
  session.items.forEach((item, index) => {
    if (!item.id || itemIds.has(item.id) || item.questionId !== session.questionIds[index]
      || !Number.isInteger(item.mistakeCount) || item.mistakeCount < 0) {
      throw new Error("当日セッションの問題情報が不正です");
    }
    itemIds.add(item.id);
  });
}

function validateKanjiSessionAttempt(attempt: KanjiSessionAttempt): void {
  validateAttempt(attempt);
  if (attempt.subject !== "kanji" || (attempt.mode !== "reading" && attempt.mode !== "writing")
    || !attempt.sessionItemId || typeof attempt.firstTryCorrect !== "boolean"
    || !Array.isArray(attempt.targetKanji) || attempt.targetKanji.length === 0
    || new Set(attempt.targetKanji).size !== attempt.targetKanji.length
    || !attempt.targetKanji.every((kanji) => Array.from(kanji).length === 1)) {
    throw new Error("漢字セッション回答の形式が不正です");
  }
  if (attempt.firstTryCorrect && (!attempt.correct || attempt.mistakes > 0 || attempt.usedGuide)) {
    throw new Error("初回正解と回答結果が一致しません");
  }
  if (attempt.mode === "writing") {
    const resultCharacters = attempt.characterResults?.map((result) => result.character) ?? [];
    if (resultCharacters.length !== attempt.targetKanji.length
      || new Set(resultCharacters).size !== resultCharacters.length
      || !attempt.targetKanji.every((kanji) => resultCharacters.includes(kanji))) {
      throw new Error("書き問題の文字別結果が不足しています");
    }
  }
}

function validateUnitSessionAttempt(attempt: UnitSessionAttempt): void {
  validateAttempt(attempt);
  if (attempt.subject !== "units" || attempt.mode !== "quiz"
    || !attempt.sessionItemId || typeof attempt.firstTryCorrect !== "boolean"
    || typeof attempt.unitStateKey !== "string" || !/^[a-z]+:[a-zA-Z]+$/u.test(attempt.unitStateKey)
    || attempt.targetKanji !== undefined || attempt.characterResults !== undefined) {
    throw new Error("単位セッション回答の形式が不正です");
  }
  if (attempt.firstTryCorrect && (!attempt.correct || attempt.mistakes > 0 || attempt.usedGuide)) {
    throw new Error("初回正解と回答結果が一致しません");
  }
}

function validateKanjiFreePracticeAttempt(attempt: KanjiFreePracticeAttempt): void {
  validateAttempt(attempt);
  if (attempt.subject !== "kanji" || attempt.sessionId !== "free-practice"
    || (attempt.mode !== "reading" && attempt.mode !== "writing")
    || attempt.sessionItemId !== undefined || typeof attempt.firstTryCorrect !== "boolean"
    || !Array.isArray(attempt.targetKanji) || attempt.targetKanji.length === 0
    || new Set(attempt.targetKanji).size !== attempt.targetKanji.length
    || !attempt.targetKanji.every((kanji) => Array.from(kanji).length === 1)) {
    throw new Error("漢字自由練習回答の形式が不正です");
  }
  if (!attempt.correct || (attempt.firstTryCorrect && (attempt.mistakes > 0 || attempt.usedGuide))) {
    throw new Error("自由練習の完了結果が回答内容と一致しません");
  }
  if (attempt.mode === "writing") {
    const resultCharacters = attempt.characterResults?.map((result) => result.character) ?? [];
    if (resultCharacters.length !== attempt.targetKanji.length
      || new Set(resultCharacters).size !== resultCharacters.length
      || !attempt.targetKanji.every((kanji) => resultCharacters.includes(kanji))) {
      throw new Error("書き問題の文字別結果が不足しています");
    }
  }
}

function defaultKanjiState(kanji: string, updatedAt: string): KanjiState {
  return {
    kanji,
    learned: true,
    reading: createEmptyKanjiSkillStats(),
    writing: createEmptyKanjiSkillStats(),
    updatedAt,
  };
}

function normalizeKanjiState(state: KanjiState, updatedAt = state.updatedAt): KanjiState {
  return {
    ...state,
    reading: state.reading ?? createEmptyKanjiSkillStats(),
    writing: state.writing ?? createEmptyKanjiSkillStats(),
    updatedAt,
  };
}

type AttemptImpact = {
  impact: SkillImpact;
  usedGuide: boolean;
  strokeMistakes: number;
};

function getAttemptImpacts(attempt: KanjiSessionAttempt | KanjiFreePracticeAttempt): Map<string, AttemptImpact> {
  if (attempt.mode === "reading") {
    const impact: SkillImpact = attempt.firstTryCorrect ? "decrease" : "increase";
    return new Map(attempt.targetKanji.map((kanji) => [kanji, {
      impact,
      usedGuide: attempt.usedGuide,
      strokeMistakes: 0,
    }]));
  }

  return new Map((attempt.characterResults ?? []).map((result) => [result.character, {
    impact: result.mistakes > 0 || result.usedGuide ? "increase" as const : "decrease" as const,
    usedGuide: result.usedGuide,
    strokeMistakes: result.mistakes,
  }]));
}

function applyImpact(
  current: KanjiSkillStats,
  details: AttemptImpact,
  firstImpact: boolean,
  firstUnknown: boolean,
  answeredAt: string,
): KanjiSkillStats {
  const next = { ...current };
  if (firstImpact) {
    next.presentations += 1;
    next.lastPresentedAt = answeredAt;
    if (details.impact === "increase") {
      next.mistakePresentations += 1;
      next.weakness = Math.min(10, next.weakness + 1);
    } else {
      next.firstTryCorrect += 1;
      next.weakness = Math.max(0, next.weakness - 1);
      next.lastFirstTryCorrectAt = answeredAt;
    }
  }
  if (firstUnknown) next.unknownCount += 1;
  next.strokeMistakes += details.strokeMistakes;
  return next;
}

async function readMotivationState(
  store: IDBObjectStore,
  fallbackUpdatedAt: string,
): Promise<MotivationState> {
  const existing = await requestResult(
    store.get("app") as IDBRequest<MotivationState | undefined>,
  );
  return existing ?? createInitialMotivationState(fallbackUpdatedAt);
}

function applyPointsEarned(state: MotivationState, answeredAt: string): MotivationState {
  return {
    ...state,
    pointsBalance: state.pointsBalance + 1,
    lastAnsweredAt: answeredAt,
    updatedAt: answeredAt,
  };
}

function applyFeed(state: MotivationState, cost: FoodCost, now: string): MotivationState {
  if (!state.activePetSpecies) throw new Error("これ以上育てられるペットがいません");
  if (state.pointsBalance < cost) throw new Error("ポイントが足りません");

  const investedPoints = state.activePetInvestedPoints + cost;
  const pointsBalance = state.pointsBalance - cost;

  if (investedPoints < POINTS_TO_COMPLETE_PET) {
    return { ...state, pointsBalance, activePetInvestedPoints: investedPoints, updatedAt: now };
  }

  const completedPets = [
    ...state.completedPets,
    { species: state.activePetSpecies, completedAt: now },
  ];
  const nextSpecies = PET_SPECIES[completedPets.length] ?? null;
  return {
    ...state,
    pointsBalance,
    activePetSpecies: nextSpecies,
    activePetInvestedPoints: 0,
    completedPets,
    updatedAt: now,
  };
}

export function openStudyDatabase(
  factory: IDBFactory = indexedDB,
  name = STUDY_DB_NAME,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, STUDY_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = request.result;
      const upgradeTransaction = request.transaction;
      if (!upgradeTransaction) throw new Error("データベース更新を開始できませんでした");

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

      if (!database.objectStoreNames.contains(STORE_NAMES.motivation)) {
        database.createObjectStore(STORE_NAMES.motivation, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(STORE_NAMES.unitStates)) {
        database.createObjectStore(STORE_NAMES.unitStates, { keyPath: "key" });
      }

      const sessions = upgradeTransaction.objectStore(STORE_NAMES.sessions);
      if (!sessions.indexNames.contains("localDate")) {
        sessions.createIndex("localDate", "localDate");
      }
      if (!sessions.indexNames.contains("localDateMode")) {
        sessions.createIndex("localDateMode", ["localDate", "mode"]);
      }

      if (event.oldVersion < 2) {
        const states = upgradeTransaction.objectStore(STORE_NAMES.kanjiStates);
        const cursorRequest = states.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const legacy = cursor.value as Partial<KanjiState> & Pick<KanjiState, "kanji" | "learned" | "updatedAt">;
          cursor.update({
            ...legacy,
            reading: legacy.reading ?? createEmptyKanjiSkillStats(),
            writing: legacy.writing ?? createEmptyKanjiSkillStats(),
          });
          cursor.continue();
        };
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

  async createDailySession(session: DailyStudySession): Promise<SaveAttemptResult> {
    validateDailySession(session);
    const database = await this.database();
    const transaction = database.transaction(STORE_NAMES.sessions, "readwrite");
    const completion = transactionComplete(transaction);

    try {
      await requestResult(transaction.objectStore(STORE_NAMES.sessions).add(session));
      await completion;
      return "added";
    } catch (error) {
      await completion.catch(() => undefined);
      if (!(error instanceof DOMException) || error.name !== "ConstraintError") throw error;
      const existing = await this.getDailySession(session.id);
      if (existing && sameRecord(existing, session)) return "duplicate";
      throw new Error(`当日セッションID ${session.id} は別の内容です`);
    }
  }

  async getDailySession(id: string): Promise<DailyStudySession | undefined> {
    const session = await this.get<DailyStudySession>(STORE_NAMES.sessions, id);
    return session && normalizeDailySession(session);
  }

  // The stored index stays [localDate, mode]; subject is filtered in memory so
  // that pre-v4 records, which carry no subject key, are never skipped by it.
  async listDailySessions(
    localDate: string,
    subject?: Subject,
    mode?: string,
  ): Promise<DailyStudySession[]> {
    const database = await this.database();
    const transaction = database.transaction(STORE_NAMES.sessions, "readonly");
    const stored = await requestResult(
      transaction.objectStore(STORE_NAMES.sessions).index("localDate").getAll(localDate) as IDBRequest<DailyStudySession[]>,
    );
    await transactionComplete(transaction);
    return stored
      .map(normalizeDailySession)
      .filter((session) => (!subject || session.subject === subject) && (!mode || session.mode === mode));
  }

  async recordKanjiSessionAttempt(attempt: KanjiSessionAttempt): Promise<SaveAttemptResult> {
    validateKanjiSessionAttempt(attempt);
    const database = await this.database();
    const transaction = database.transaction(
      [STORE_NAMES.attempts, STORE_NAMES.sessions, STORE_NAMES.kanjiStates, STORE_NAMES.motivation],
      "readwrite",
    );
    const completion = transactionComplete(transaction);
    const attemptsStore = transaction.objectStore(STORE_NAMES.attempts);
    const sessionsStore = transaction.objectStore(STORE_NAMES.sessions);
    const statesStore = transaction.objectStore(STORE_NAMES.kanjiStates);
    const motivationStore = transaction.objectStore(STORE_NAMES.motivation);

    try {
      const existingAttempt = await requestResult(
        attemptsStore.get(attempt.id) as IDBRequest<StudyAttempt | undefined>,
      );
      if (existingAttempt) {
        await completion;
        if (sameRecord(existingAttempt, attempt)) return "duplicate";
        throw new Error(`回答ID ${attempt.id} は別の内容です`);
      }

      const stored = await requestResult(
        sessionsStore.get(attempt.sessionId) as IDBRequest<DailyKanjiSession | undefined>,
      );
      if (!stored) throw new Error("当日セッションが見つかりません");
      const session = normalizeDailySession(stored) as DailyKanjiSession;
      if (session.subject !== "kanji") throw new Error("漢字以外の当日セッションです");
      if (session.mode !== attempt.mode) throw new Error("回答形式が当日セッションと一致しません");

      const currentItem = session.items[session.currentIndex];
      if (!currentItem || currentItem.id !== attempt.sessionItemId) {
        throw new Error("現在の問題ではありません");
      }
      if (currentItem.status === "completed") throw new Error("完了済みの問題です");
      if (currentItem.questionId !== attempt.questionId) throw new Error("問題IDが当日セッションと一致しません");

      const impactMap = getAttemptImpacts(attempt);
      const uniqueKanji = [...impactMap.keys()];
      const currentStates = await Promise.all(uniqueKanji.map((kanji) => requestResult(
        statesStore.get(kanji) as IDBRequest<KanjiState | undefined>,
      )));
      const nextImpacts = { ...currentItem.impacts };
      const nextUnknownKanji = [...currentItem.unknownKanji];
      const stateUpdates = uniqueKanji.map((kanji, index) => {
        const details = impactMap.get(kanji);
        if (!details) throw new Error("漢字別更新情報が不足しています");
        const currentState = normalizeKanjiState(
          currentStates[index] ?? defaultKanjiState(kanji, attempt.answeredAt),
          attempt.answeredAt,
        );
        const firstImpact = nextImpacts[kanji] === undefined;
        const firstUnknown = details.usedGuide && !nextUnknownKanji.includes(kanji);
        if (firstImpact) nextImpacts[kanji] = details.impact;
        if (firstUnknown) nextUnknownKanji.push(kanji);
        const skill = applyImpact(
          currentState[attempt.mode],
          details,
          firstImpact,
          firstUnknown,
          attempt.answeredAt,
        );
        return { ...currentState, [attempt.mode]: skill, updatedAt: attempt.answeredAt };
      });

      const nextItem: DailySessionItem = {
        ...currentItem,
        status: attempt.correct ? "completed" : "in-progress",
        mistakeCount: currentItem.mistakeCount + attempt.mistakes,
        usedGuide: currentItem.usedGuide || attempt.usedGuide,
        impacts: nextImpacts,
        unknownKanji: nextUnknownKanji,
        completedAt: attempt.correct ? attempt.answeredAt : null,
      };
      const nextItems = session.items.map((item, index) => index === session.currentIndex ? nextItem : item);
      const nextIndex = attempt.correct ? session.currentIndex + 1 : session.currentIndex;
      const nextSession: DailyKanjiSession = {
        ...session,
        items: nextItems,
        currentIndex: nextIndex,
        updatedAt: attempt.answeredAt,
        completedAt: nextIndex === session.items.length ? attempt.answeredAt : null,
      };

      const motivationState = applyPointsEarned(
        await readMotivationState(motivationStore, attempt.answeredAt),
        attempt.answeredAt,
      );

      await Promise.all([
        requestResult(attemptsStore.add(attempt)),
        requestResult(sessionsStore.put(nextSession)),
        ...stateUpdates.map((state) => requestResult(statesStore.put(state))),
        requestResult(motivationStore.put(motivationState)),
      ]);
      await completion;
      return "added";
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be complete after a duplicate read.
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }

  async recordUnitSessionAttempt(attempt: UnitSessionAttempt): Promise<SaveAttemptResult> {
    validateUnitSessionAttempt(attempt);
    const database = await this.database();
    const transaction = database.transaction(
      [STORE_NAMES.attempts, STORE_NAMES.sessions, STORE_NAMES.unitStates, STORE_NAMES.motivation],
      "readwrite",
    );
    const completion = transactionComplete(transaction);
    const attemptsStore = transaction.objectStore(STORE_NAMES.attempts);
    const sessionsStore = transaction.objectStore(STORE_NAMES.sessions);
    const statesStore = transaction.objectStore(STORE_NAMES.unitStates);
    const motivationStore = transaction.objectStore(STORE_NAMES.motivation);

    try {
      const existingAttempt = await requestResult(
        attemptsStore.get(attempt.id) as IDBRequest<StudyAttempt | undefined>,
      );
      if (existingAttempt) {
        await completion;
        if (sameRecord(existingAttempt, attempt)) return "duplicate";
        throw new Error(`回答ID ${attempt.id} は別の内容です`);
      }

      const stored = await requestResult(
        sessionsStore.get(attempt.sessionId) as IDBRequest<DailyStudySession | undefined>,
      );
      if (!stored) throw new Error("当日セッションが見つかりません");
      const session = normalizeDailySession(stored);
      if (!isUnitSession(session)) throw new Error("単位以外の当日セッションです");

      const currentItem = session.items[session.currentIndex];
      if (!currentItem || currentItem.id !== attempt.sessionItemId) {
        throw new Error("現在の問題ではありません");
      }
      if (currentItem.status === "completed") throw new Error("完了済みの問題です");
      if (currentItem.questionId !== attempt.questionId) throw new Error("問題IDが当日セッションと一致しません");
      if (currentItem.unitStateKey !== attempt.unitStateKey) {
        throw new Error("集計キーが当日セッションと一致しません");
      }

      // Only the first result for a question moves the aggregate, mirroring the
      // one-update-per-presentation rule in ADR-0002. "分からない" is counted the
      // first time it happens, which may be a later try.
      const firstImpact = !currentItem.counted;
      const firstUnknown = attempt.usedGuide && !currentItem.unknownCounted;
      const currentState = await requestResult(
        statesStore.get(attempt.unitStateKey) as IDBRequest<UnitState | undefined>,
      ) ?? createEmptyUnitState(attempt.unitStateKey, attempt.answeredAt);
      const nextState: UnitState = { ...currentState, updatedAt: attempt.answeredAt };
      if (firstImpact) {
        nextState.presentations += 1;
        nextState.lastPresentedAt = attempt.answeredAt;
        if (attempt.firstTryCorrect) {
          nextState.firstTryCorrect += 1;
          nextState.weakness = Math.max(0, nextState.weakness - 1);
          nextState.lastFirstTryCorrectAt = attempt.answeredAt;
        } else {
          nextState.mistakePresentations += 1;
          nextState.weakness = Math.min(10, nextState.weakness + 1);
        }
      }
      if (firstUnknown) nextState.unknownCount += 1;

      const nextItem: UnitSessionItem = {
        ...currentItem,
        status: attempt.correct ? "completed" : "in-progress",
        mistakeCount: currentItem.mistakeCount + attempt.mistakes,
        usedGuide: currentItem.usedGuide || attempt.usedGuide,
        counted: true,
        unknownCounted: currentItem.unknownCounted || attempt.usedGuide,
        completedAt: attempt.correct ? attempt.answeredAt : null,
      };
      const nextIndex = attempt.correct ? session.currentIndex + 1 : session.currentIndex;
      const nextSession: DailyUnitSession = {
        ...session,
        items: session.items.map((item, index) => index === session.currentIndex ? nextItem : item),
        currentIndex: nextIndex,
        updatedAt: attempt.answeredAt,
        completedAt: nextIndex === session.items.length ? attempt.answeredAt : null,
      };

      const motivationState = applyPointsEarned(
        await readMotivationState(motivationStore, attempt.answeredAt),
        attempt.answeredAt,
      );

      await Promise.all([
        requestResult(attemptsStore.add(attempt)),
        requestResult(sessionsStore.put(nextSession)),
        requestResult(statesStore.put(nextState)),
        requestResult(motivationStore.put(motivationState)),
      ]);
      await completion;
      return "added";
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be complete after a duplicate read.
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }

  async getUnitState(key: string): Promise<UnitState | undefined> {
    return this.get<UnitState>(STORE_NAMES.unitStates, key);
  }

  async listUnitStates(): Promise<UnitState[]> {
    const database = await this.database();
    const transaction = database.transaction(STORE_NAMES.unitStates, "readonly");
    const result = await requestResult(
      transaction.objectStore(STORE_NAMES.unitStates).getAll() as IDBRequest<UnitState[]>,
    );
    await transactionComplete(transaction);
    return result;
  }

  async recordKanjiFreePracticeAttempt(attempt: KanjiFreePracticeAttempt): Promise<SaveAttemptResult> {
    validateKanjiFreePracticeAttempt(attempt);
    const database = await this.database();
    const transaction = database.transaction(
      [STORE_NAMES.attempts, STORE_NAMES.kanjiStates, STORE_NAMES.motivation],
      "readwrite",
    );
    const completion = transactionComplete(transaction);
    const attemptsStore = transaction.objectStore(STORE_NAMES.attempts);
    const statesStore = transaction.objectStore(STORE_NAMES.kanjiStates);
    const motivationStore = transaction.objectStore(STORE_NAMES.motivation);

    try {
      const existingAttempt = await requestResult(
        attemptsStore.get(attempt.id) as IDBRequest<StudyAttempt | undefined>,
      );
      if (existingAttempt) {
        await completion;
        if (sameRecord(existingAttempt, attempt)) return "duplicate";
        throw new Error(`回答ID ${attempt.id} は別の内容です`);
      }

      const impactMap = getAttemptImpacts(attempt);
      const uniqueKanji = [...impactMap.keys()];
      const currentStates = await Promise.all(uniqueKanji.map((kanji) => requestResult(
        statesStore.get(kanji) as IDBRequest<KanjiState | undefined>,
      )));
      if (currentStates.some((state) => state?.learned === false)) {
        throw new Error("未履修の漢字を含む問題は自由練習できません");
      }
      const stateUpdates = uniqueKanji.map((kanji, index) => {
        const details = impactMap.get(kanji);
        if (!details) throw new Error("漢字別更新情報が不足しています");
        const currentState = normalizeKanjiState(
          currentStates[index] ?? defaultKanjiState(kanji, attempt.answeredAt),
          attempt.answeredAt,
        );
        const skill = applyImpact(
          currentState[attempt.mode],
          details,
          true,
          details.usedGuide,
          attempt.answeredAt,
        );
        return { ...currentState, [attempt.mode]: skill, updatedAt: attempt.answeredAt };
      });

      const motivationState = applyPointsEarned(
        await readMotivationState(motivationStore, attempt.answeredAt),
        attempt.answeredAt,
      );

      await Promise.all([
        requestResult(attemptsStore.add(attempt)),
        ...stateUpdates.map((state) => requestResult(statesStore.put(state))),
        requestResult(motivationStore.put(motivationState)),
      ]);
      await completion;
      return "added";
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be complete after a duplicate read.
      }
      await completion.catch(() => undefined);
      throw error;
    }
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

  async saveUnitLearningSettings(settings: UnitLearningSettings): Promise<void> {
    await this.put(STORE_NAMES.settings, settings);
  }

  async getUnitLearningSettings(): Promise<UnitLearningSettings> {
    return (await this.get<UnitLearningSettings>(STORE_NAMES.settings, "units"))
      ?? { id: "units", unlearnedGroups: [], updatedAt: "" };
  }

  async getMotivationState(): Promise<MotivationState> {
    const database = await this.database();
    const transaction = database.transaction(STORE_NAMES.motivation, "readonly");
    const state = await readMotivationState(
      transaction.objectStore(STORE_NAMES.motivation),
      new Date().toISOString(),
    );
    await transactionComplete(transaction);
    return state;
  }

  async feedPet(cost: FoodCost, now: string): Promise<MotivationState> {
    if (!FOOD_COSTS.includes(cost)) throw new Error("エサの種類が不正です");
    const database = await this.database();
    const transaction = database.transaction(STORE_NAMES.motivation, "readwrite");
    const completion = transactionComplete(transaction);
    const store = transaction.objectStore(STORE_NAMES.motivation);

    try {
      const current = await readMotivationState(store, now);
      const next = applyFeed(current, cost, now);
      await requestResult(store.put(next));
      await completion;
      return next;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be complete after a validation error.
      }
      await completion.catch(() => undefined);
      throw error;
    }
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
