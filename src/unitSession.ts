// Units question selection and daily sessions (docs/units-plan.md 5, 8).
// Mirrors dailySession.ts, ranking by the weakness aggregate key rather than
// by kanji, per ADR-0007.

import { createId } from "./id";
import { WEAK_SLOTS, WEAK_SLOT_THRESHOLD } from "./dailySession";
import { getUnitStateKey, type UnitQuestion } from "./unitContent";
import type { StudyStorage } from "./storage/indexedDb";
import {
  dailySessionId,
  isUnitSession,
  unitLearningGroup,
  type DailyUnitSession,
  type UnitSessionItem,
  type UnitState,
} from "./storage/schema";

export const DEFAULT_UNIT_QUESTION_COUNT = 10;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function isUnitQuestionAllowed(question: UnitQuestion, unlearnedGroups: string[]): boolean {
  return !unlearnedGroups.includes(unitLearningGroup(question.unitCategory, question.grade));
}

type SelectionOptions = {
  limit?: number;
  states?: UnitState[];
  unlearnedGroups?: string[];
  seed?: string;
  /** Grades to draw from (ADR-0009). Undefined means every grade. */
  grades?: number[];
};

/**
 * Fewest-practised aggregate key first, ties broken by a per-set random order,
 * and spread across keys so one set is not ten questions of the same kind.
 */
export function selectUnitQuestions(
  questions: UnitQuestion[],
  {
    limit = DEFAULT_UNIT_QUESTION_COUNT,
    states = [],
    unlearnedGroups = [],
    seed = "units",
    grades,
  }: SelectionOptions = {},
): UnitQuestion[] {
  const stateMap = new Map(states.map((state) => [state.key, state]));

  // Unlearned groups first, then the grade choice (ADR-0009), then ranking.
  const eligible = questions
    .filter((question) => isUnitQuestionAllowed(question, unlearnedGroups))
    .filter((question) => !grades || grades.includes(question.grade))
    .map((question) => {
      const key = getUnitStateKey(question);
      const state = stateMap.get(key);
      return {
        question,
        key,
        presentations: state?.presentations ?? 0,
        weakness: state?.weakness ?? 0,
        lastPresentedAt: state?.lastPresentedAt ?? "",
        tie: stableHash(`${seed}:${question.id}`),
      };
    });

  const byCoverage = [...eligible].sort((left, right) =>
    left.presentations - right.presentations || left.tie - right.tie,
  );
  const byWeakness = eligible
    .filter((candidate) => candidate.weakness >= WEAK_SLOT_THRESHOLD)
    .sort((left, right) =>
      right.weakness - left.weakness
      || left.lastPresentedAt.localeCompare(right.lastPresentedAt)
      || left.tie - right.tie,
    );

  const selected: UnitQuestion[] = [];
  const usedKeys = new Set<string>();
  const take = (candidates: typeof eligible, upTo: number) => {
    for (const allowRepeatKey of [false, true]) {
      for (const candidate of candidates) {
        if (selected.length >= upTo) return;
        if (selected.some((question) => question.id === candidate.question.id)) continue;
        if (usedKeys.has(candidate.key) !== allowRepeatKey) continue;
        selected.push(candidate.question);
        usedKeys.add(candidate.key);
      }
    }
  };

  // Weak slots are an upper bound; anything they leave goes back to coverage.
  take(byWeakness, Math.min(WEAK_SLOTS, limit));
  take(byCoverage, limit);
  return selected;
}

export function createUnitSession(
  localDate: string,
  batchNumber: number,
  questions: UnitQuestion[],
  now: Date,
): DailyUnitSession {
  const id = dailySessionId(localDate, "units", "quiz", batchNumber);
  const timestamp = now.toISOString();
  const items: UnitSessionItem[] = questions.map((question, index) => ({
    id: `${id}:item:${index + 1}`,
    questionId: question.id,
    status: "pending",
    mistakeCount: 0,
    usedGuide: false,
    unitStateKey: getUnitStateKey(question),
    counted: false,
    unknownCounted: false,
    completedAt: null,
  }));

  return {
    id,
    subject: "units",
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

async function listUnitSessions(
  storage: StudyStorage,
  localDate: string,
): Promise<DailyUnitSession[]> {
  return (await storage.listDailySessions(localDate, "units"))
    .filter(isUnitSession)
    .sort((left, right) => left.batchNumber - right.batchNumber);
}

export async function startNextUnitBatch(
  storage: StudyStorage,
  questions: UnitQuestion[],
  localDate: string,
  now = new Date(),
  seed = createId(),
): Promise<DailyUnitSession | null> {
  const [sessions, states, learning, gradeSettings] = await Promise.all([
    listUnitSessions(storage, localDate),
    storage.listUnitStates(),
    storage.getUnitLearningSettings(),
    storage.getGradeSettings(),
  ]);
  const selected = selectUnitQuestions(questions, {
    states,
    unlearnedGroups: learning.unlearnedGroups,
    seed,
    grades: gradeSettings.grades,
  });
  if (selected.length === 0) return null;

  const batchNumber = Math.max(0, ...sessions.map((session) => session.batchNumber)) + 1;
  const session = createUnitSession(localDate, batchNumber, selected, now);
  await storage.createDailySession(session);
  const stored = await storage.getDailySession(session.id);
  return stored && isUnitSession(stored) ? stored : session;
}

export type UnitSessionSummary = {
  firstTryCorrect: number;
  correctedAfterMistake: number;
  unknown: number;
};

export function summarizeUnitSession(session: DailyUnitSession): UnitSessionSummary {
  return session.items.reduce<UnitSessionSummary>((summary, item) => {
    if (item.status !== "completed") return summary;
    if (item.unknownCounted || item.usedGuide) summary.unknown += 1;
    else if (item.mistakeCount > 0) summary.correctedAfterMistake += 1;
    else summary.firstTryCorrect += 1;
    return summary;
  }, { firstTryCorrect: 0, correctedAfterMistake: 0, unknown: 0 });
}
