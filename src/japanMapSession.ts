import { createId } from "./id";
import type { JapanMapQuestion } from "./japanMapContent";
import type { StudyStorage } from "./storage/indexedDb";
import {
  dailySessionId,
  isJapanMapSession,
  type DailyJapanMapSession,
  type DailySessionItem,
  type StudyAttempt,
} from "./storage/schema";

export const DEFAULT_JAPAN_MAP_QUESTION_COUNT = 10;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

type SelectionOptions = {
  limit?: number;
  attempts?: StudyAttempt[];
  seed?: string;
};

/** Slots reserved for weak prefectures in one batch, as an upper bound (ADR-0008). */
const WEAK_SLOTS = 4;
/** Same 0..10 range as the kanji and units weakness aggregates (ADR-0002). */
const MAX_WEAKNESS = 10;

type MapHistory = {
  presentations: number;
  weakness: number;
  lastPresentedAt: string;
};

/**
 * Replays one prefecture's attempts item by item. An item answered first time
 * lowers weakness by one; a wrong click or "分からない" raises it by one, however
 * many wrong clicks the item took. Weakness therefore falls back to 0 once the
 * child keeps getting it right, instead of pinning a prefecture into every set.
 */
function summarizeHistory(attempts: StudyAttempt[]): MapHistory {
  const items = new Map<string, { missed: boolean }>();
  for (const attempt of attempts) {
    const key = attempt.sessionItemId ?? `${attempt.sessionId}:${attempt.questionId}`;
    const item = items.get(key) ?? { missed: false };
    if (!attempt.correct || attempt.usedGuide) item.missed = true;
    items.set(key, item);
  }
  let weakness = 0;
  for (const { missed } of items.values()) {
    weakness = missed ? Math.min(MAX_WEAKNESS, weakness + 1) : Math.max(0, weakness - 1);
  }
  return { presentations: items.size, weakness, lastPresentedAt: attempts.at(-1)?.answeredAt ?? "" };
}

export function selectJapanMapQuestions(
  questions: JapanMapQuestion[],
  { limit = DEFAULT_JAPAN_MAP_QUESTION_COUNT, attempts = [], seed = "japan-map" }: SelectionOptions = {},
): JapanMapQuestion[] {
  // `attempts` arrives oldest first (the store reads them by answeredAt).
  const attemptsByQuestion = new Map<string, StudyAttempt[]>();
  for (const attempt of attempts) {
    if (attempt.subject !== "japan-map" || attempt.mode !== "quiz") continue;
    const list = attemptsByQuestion.get(attempt.questionId) ?? [];
    list.push(attempt);
    attemptsByQuestion.set(attempt.questionId, list);
  }
  const candidates = questions.map((question) => ({
    question,
    ...summarizeHistory(attemptsByQuestion.get(question.id) ?? []),
    tie: stableHash(`${seed}:${question.id}`),
  }));

  const byWeakness = candidates
    .filter((candidate) => candidate.weakness > 0)
    .sort((left, right) => right.weakness - left.weakness
      || left.lastPresentedAt.localeCompare(right.lastPresentedAt)
      || left.tie - right.tie);
  const byCoverage = [...candidates].sort((left, right) => left.presentations - right.presentations || left.tie - right.tie);
  const selected: JapanMapQuestion[] = [];

  // One prefecture per set: a name question colours the prefecture on the
  // map, which would give away a location question for it in the same set.
  // Repeats are allowed only when there are not enough prefectures.
  const takeDistinct = (source: typeof candidates, upTo: number, passes: boolean[]) => {
    for (const allowRepeat of passes) {
      for (const candidate of source) {
        if (selected.length >= upTo) return;
        if (selected.some((question) => question.id === candidate.question.id)) continue;
        if (!allowRepeat && selected.some((question) => question.prefectureId === candidate.question.prefectureId)) continue;
        selected.push(candidate.question);
      }
    }
  };
  takeDistinct(byWeakness.slice(0, Math.min(WEAK_SLOTS, limit)), Math.min(WEAK_SLOTS, limit), [false]);
  takeDistinct(byCoverage, limit, [false, true]);
  // Mix the weak slots into the set so it does not always open with them.
  return selected
    .map((question) => ({ question, order: stableHash(`${seed}:order:${question.id}`) }))
    .sort((left, right) => left.order - right.order)
    .map(({ question }) => question);
}

function createJapanMapSession(
  localDate: string,
  batchNumber: number,
  questions: JapanMapQuestion[],
  now: Date,
): DailyJapanMapSession {
  const id = dailySessionId(localDate, "japan-map", "quiz", batchNumber);
  const timestamp = now.toISOString();
  const items: DailySessionItem[] = questions.map((question, index) => ({
    id: `${id}:item:${index + 1}`,
    questionId: question.id,
    status: "pending",
    mistakeCount: 0,
    usedGuide: false,
    impacts: {},
    unknownKanji: [],
    completedAt: null,
  }));

  return {
    id,
    subject: "japan-map",
    localDate,
    mode: "quiz",
    batchNumber,
    questionIds: questions.map((question) => question.id),
    items,
    currentIndex: 0,
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
  };
}

export async function startNextJapanMapBatch(
  storage: StudyStorage,
  questions: JapanMapQuestion[],
  localDate: string,
  now = new Date(),
  seed = createId(),
): Promise<DailyJapanMapSession | null> {
  const gradeSettings = await storage.getGradeSettings();
  if (!gradeSettings.grades.includes(4)) return null;

  const [sessions, attempts] = await Promise.all([
    storage.listDailySessions(localDate, "japan-map"),
    storage.listAttempts(),
  ]);
  const selected = selectJapanMapQuestions(questions, { attempts, seed });
  if (selected.length === 0) return null;

  const batchNumber = Math.max(0, ...sessions
    .filter(isJapanMapSession)
    .map((session) => session.batchNumber)) + 1;
  const session = createJapanMapSession(localDate, batchNumber, selected, now);
  await storage.createDailySession(session);
  const stored = await storage.getDailySession(session.id);
  return stored && isJapanMapSession(stored) ? stored : session;
}

export type JapanMapSessionSummary = {
  firstTryCorrect: number;
  correctedAfterMistake: number;
  unknown: number;
};

export function summarizeJapanMapSession(session: DailyJapanMapSession): JapanMapSessionSummary {
  return session.items.reduce<JapanMapSessionSummary>((summary, item) => {
    if (item.status !== "completed") return summary;
    if (item.usedGuide) summary.unknown += 1;
    else if (item.mistakeCount > 0) summary.correctedAfterMistake += 1;
    else summary.firstTryCorrect += 1;
    return summary;
  }, { firstTryCorrect: 0, correctedAfterMistake: 0, unknown: 0 });
}
