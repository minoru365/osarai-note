import type { KanjiQuestion } from "./contentPack";
import { createId } from "./id";
import type { StudyStorage } from "./storage/indexedDb";
import {
  dailySessionId,
  type DailyKanjiSession,
  type KanjiState,
  type KanjiStudyMode,
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
    seed = "daily",
  }: SelectionOptions,
): KanjiQuestion[] {
  const stateMap = new Map(states.map((state) => [state.kanji, state]));

  const ranked = questions
    .filter((question) => question.mode === mode)
    .filter((question) => question.targetKanji.every((kanji) => stateMap.get(kanji)?.learned !== false))
    .map((question) => {
      return {
        question,
        presentations: Math.min(...question.targetKanji.map((kanji) => stateMap.get(kanji)?.[mode].presentations ?? 0)),
        tie: stableHash(`${seed}:${question.id}`),
      };
    })
    .sort((left, right) =>
      left.presentations - right.presentations
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
  const id = dailySessionId(localDate, "kanji", mode, batchNumber);
  const timestamp = now.toISOString();
  return {
    id,
    subject: "kanji",
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
  seed: string,
): Promise<DailyKanjiSession | null> {
  const localDate = getLocalDate(now);
  const states = await storage.listKanjiStates();
  const selected = selectDailyQuestions(questions, {
    mode,
    states,
    seed,
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
  const sessions = (await storage.listDailySessions(getLocalDate(now), "kanji", mode))
    .sort((left, right) => left.batchNumber - right.batchNumber);
  const incomplete = [...sessions].reverse().find((session) => session.completedAt === null);
  if (incomplete) return incomplete;
  if (sessions.length > 0) return sessions.at(-1) ?? null;
  return createBatch(storage, questions, mode, now, sessions, createId());
}

export async function startNextDailyBatch(
  storage: StudyStorage,
  questions: KanjiQuestion[],
  mode: KanjiStudyMode,
  now = new Date(),
  seed = createId(),
): Promise<DailyKanjiSession | null> {
  const sessions = (await storage.listDailySessions(getLocalDate(now), "kanji", mode))
    .sort((left, right) => left.batchNumber - right.batchNumber);
  return createBatch(storage, questions, mode, now, sessions, seed);
}
