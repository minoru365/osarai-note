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

export function selectJapanMapQuestions(
  questions: JapanMapQuestion[],
  { limit = DEFAULT_JAPAN_MAP_QUESTION_COUNT, attempts = [], seed = "japan-map" }: SelectionOptions = {},
): JapanMapQuestion[] {
  const mapAttempts = attempts.filter((attempt) => attempt.subject === "japan-map" && attempt.mode === "quiz");
  const candidates = questions.map((question) => {
    const questionAttempts = mapAttempts.filter((attempt) => attempt.questionId === question.id);
    const weakness = questionAttempts.filter((attempt) => !attempt.correct || attempt.usedGuide).length;
    const lastPresentedAt = questionAttempts.at(-1)?.answeredAt ?? "";
    return {
      question,
      presentations: questionAttempts.length,
      weakness,
      lastPresentedAt,
      tie: stableHash(`${seed}:${question.id}`),
    };
  });

  const byWeakness = candidates
    .filter((candidate) => candidate.weakness > 0)
    .sort((left, right) => right.weakness - left.weakness
      || left.lastPresentedAt.localeCompare(right.lastPresentedAt)
      || left.tie - right.tie);
  const byCoverage = [...candidates].sort((left, right) => left.presentations - right.presentations || left.tie - right.tie);
  const selected: JapanMapQuestion[] = [];
  const take = (source: typeof candidates) => {
    for (const candidate of source) {
      if (selected.length >= limit) return;
      if (!selected.some((question) => question.id === candidate.question.id)) selected.push(candidate.question);
    }
  };

  take(byWeakness.slice(0, Math.min(4, limit)));
  take(byCoverage);
  return selected;
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
