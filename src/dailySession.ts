import type { KanjiQuestion } from "./contentPack";
import type { StudyStorage } from "./storage/indexedDb";
import type {
  DailyKanjiSession,
  KanjiState,
  KanjiStudyMode,
  StudyAttempt,
} from "./storage/schema";

export const DEFAULT_DAILY_QUESTION_COUNT = 10;

export type DailySessionSummary = {
  firstTryCorrect: number;
  correctedAfterMistake: number;
  unknown: number;
};

export function summarizeDailySession(session: DailyKanjiSession): DailySessionSummary {
  return session.items.reduce<DailySessionSummary>((summary, item) => {
    if (item.status !== "completed") return summary;
    if (item.unknownKanji.length > 0 || item.usedGuide) summary.unknown += 1;
    else if (item.mistakeCount > 0 || Object.values(item.impacts).includes("increase")) {
      summary.correctedAfterMistake += 1;
    } else summary.firstTryCorrect += 1;
    return summary;
  }, { firstTryCorrect: 0, correctedAfterMistake: 0, unknown: 0 });
}

type SelectionOptions = {
  mode: KanjiStudyMode;
  limit?: number;
  states?: KanjiState[];
  attempts?: StudyAttempt[];
  seenQuestionIds?: Iterable<string>;
  seenKanji?: Iterable<string>;
  seed?: string;
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getLocalDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function selectDailyQuestions(
  questions: KanjiQuestion[],
  {
    mode,
    limit = DEFAULT_DAILY_QUESTION_COUNT,
    states = [],
    attempts = [],
    seenQuestionIds = [],
    seenKanji = [],
    seed = "daily",
  }: SelectionOptions,
): KanjiQuestion[] {
  const stateMap = new Map(states.map((state) => [state.kanji, state]));
  const seenQuestions = new Set(seenQuestionIds);
  const seenCharacters = new Set(seenKanji);
  const questionAttempts = new Map<string, StudyAttempt[]>();
  attempts.filter((attempt) => attempt.mode === mode).forEach((attempt) => {
    const current = questionAttempts.get(attempt.questionId) ?? [];
    current.push(attempt);
    questionAttempts.set(attempt.questionId, current);
  });

  const ranked = questions
    .filter((question) => question.mode === mode)
    .filter((question) => question.targetKanji.every((kanji) => stateMap.get(kanji)?.learned !== false))
    .map((question) => {
      const history = questionAttempts.get(question.id) ?? [];
      const lastAnsweredAt = history.reduce(
        (latest, attempt) => attempt.answeredAt > latest ? attempt.answeredAt : latest,
        "",
      );
      return {
        question,
        seenTier: seenQuestions.has(question.id)
          ? 2
          : question.targetKanji.some((kanji) => seenCharacters.has(kanji)) ? 1 : 0,
        weakness: Math.max(...question.targetKanji.map((kanji) => stateMap.get(kanji)?.[mode].weakness ?? 0)),
        attempted: history.length > 0,
        lastAnsweredAt,
        tie: stableHash(`${seed}:${question.id}`),
      };
    })
    .sort((left, right) =>
      left.seenTier - right.seenTier
      || right.weakness - left.weakness
      || Number(left.attempted) - Number(right.attempted)
      || left.lastAnsweredAt.localeCompare(right.lastAnsweredAt)
      || left.tie - right.tie,
    );

  const selected: KanjiQuestion[] = [];
  const selectedKanji = new Set<string>();
  for (const allowOverlap of [false, true]) {
    for (const candidate of ranked) {
      if (selected.length >= limit) break;
      if (selected.some((question) => question.id === candidate.question.id)) continue;
      const overlaps = candidate.question.targetKanji.some((kanji) => selectedKanji.has(kanji));
      if (overlaps !== allowOverlap) continue;
      selected.push(candidate.question);
      candidate.question.targetKanji.forEach((kanji) => selectedKanji.add(kanji));
    }
  }
  return selected;
}

function createSession(
  mode: KanjiStudyMode,
  localDate: string,
  batchNumber: number,
  questions: KanjiQuestion[],
  now: Date,
): DailyKanjiSession {
  const id = `${localDate}:${mode}:${batchNumber}`;
  const timestamp = now.toISOString();
  return {
    id,
    localDate,
    mode,
    batchNumber,
    questionIds: questions.map((question) => question.id),
    items: questions.map((question, index) => ({
      id: `${id}:item:${index + 1}`,
      questionId: question.id,
      status: "pending",
      mistakeCount: 0,
      usedGuide: false,
      impacts: {},
      unknownKanji: [],
      completedAt: null,
    })),
    currentIndex: 0,
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
  };
}

async function createBatch(
  storage: StudyStorage,
  questions: KanjiQuestion[],
  mode: KanjiStudyMode,
  now: Date,
  sessions: DailyKanjiSession[],
): Promise<DailyKanjiSession | null> {
  const localDate = getLocalDate(now);
  const [states, attempts] = await Promise.all([
    storage.listKanjiStates(),
    storage.listAttempts(),
  ]);
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const seenQuestionIds = sessions.flatMap((session) => session.questionIds);
  const seenKanji = seenQuestionIds.flatMap((id) => questionMap.get(id)?.targetKanji ?? []);
  const selected = selectDailyQuestions(questions, {
    mode,
    states,
    attempts,
    seenQuestionIds,
    seenKanji,
    seed: `${localDate}:${mode}:${sessions.length + 1}`,
  });
  if (selected.length === 0) return null;
  const batchNumber = Math.max(0, ...sessions.map((session) => session.batchNumber)) + 1;
  const session = createSession(mode, localDate, batchNumber, selected, now);
  await storage.createDailySession(session);
  return (await storage.getDailySession(session.id)) ?? session;
}

export async function getOrCreateDailySession(
  storage: StudyStorage,
  questions: KanjiQuestion[],
  mode: KanjiStudyMode,
  now = new Date(),
): Promise<DailyKanjiSession | null> {
  const sessions = (await storage.listDailySessions(getLocalDate(now), mode))
    .sort((left, right) => left.batchNumber - right.batchNumber);
  const incomplete = [...sessions].reverse().find((session) => session.completedAt === null);
  if (incomplete) return incomplete;
  if (sessions.length > 0) return sessions.at(-1) ?? null;
  return createBatch(storage, questions, mode, now, sessions);
}

export async function startNextDailyBatch(
  storage: StudyStorage,
  questions: KanjiQuestion[],
  mode: KanjiStudyMode,
  now = new Date(),
): Promise<DailyKanjiSession | null> {
  const sessions = (await storage.listDailySessions(getLocalDate(now), mode))
    .sort((left, right) => left.batchNumber - right.batchNumber);
  if (sessions.some((session) => session.completedAt === null)) {
    return [...sessions].reverse().find((session) => session.completedAt === null) ?? null;
  }
  return createBatch(storage, questions, mode, now, sessions);
}
