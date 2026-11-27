// Collections for がんばり記録 (ADR-0015): kanji, units, prefectures, pets and
// badges, all derived from data the app already stores. Nothing here writes.
//
// "Collected" only ever grows. A collection that took cells away when a child
// slipped up would punish mistakes, which ADR-0012 rules out. Things the child
// cannot reach yet - no published question, not taught, grade not selected -
// get their own neutral status so they never look like a failure.
import { getLocalDate } from "./dailySession";
import type { KanjiQuestion } from "./contentPack";
import { getKanjiByGrade, type KanjiGrade } from "./kanjiCatalog";
import { countsTowardPrefectureCollection, JAPAN_MAP_PREFECTURE_IDS, type JapanMapPrefectureId, type JapanMapQuestion } from "./japanMapContent";
import type { RetiredUnitQuestion, UnitQuestion } from "./unitContent";
import { isUnitQuestionAllowed } from "./unitSession";
import { UNIT_CATEGORIES, UNIT_DEFINITIONS, type UnitCategory } from "./units";
import {
  GROWTH_STAGE_COUNT,
  PET_SPECIES,
  growthStage,
  type KanjiState,
  type MotivationState,
  type PetSpeciesId,
  type SelectableGrade,
  type StudyAttempt,
} from "./storage/schema";

export type CollectionStatus =
  | "collected" // earned; never taken back
  | "practiced" // tried, not earned yet
  | "notYet" // reachable, not tried
  | "notTaught" // marked as not taught yet, or outside the selected grades
  | "preparing"; // the app has no question for it yet

export type CollectionCell<Key extends string = string> = { key: Key; label: string; status: CollectionStatus };

export type CollectionSummary = { collected: number; available: number };

/**
 * Collected cells out of the cells the app can offer. Cells waiting for a
 * question ("preparing") are left out; cells not taught yet stay in, because
 * teaching them is all it takes to make them reachable.
 */
export function summarize(cells: CollectionCell[]): CollectionSummary {
  return {
    collected: cells.filter((cell) => cell.status === "collected").length,
    available: cells.filter((cell) => cell.status !== "preparing").length,
  };
}

// ---- Kanji ---------------------------------------------------------------

/** A kanji is collected once both its reading and its writing were right first time. */
export function isKanjiCollected(state: KanjiState | undefined): boolean {
  return !!state && state.reading.firstTryCorrect > 0 && state.writing.firstTryCorrect > 0;
}

export type KanjiCollectionSection = { grade: KanjiGrade; cells: CollectionCell[] };

export function kanjiCollection(
  states: KanjiState[],
  questions: KanjiQuestion[],
  grades: readonly SelectableGrade[],
): KanjiCollectionSection[] {
  const stateMap = new Map(states.map((state) => [state.kanji, state]));
  const withQuestions = new Set(questions.flatMap((question) => question.targetKanji));
  return ([3, 4] as const).filter((grade) => grades.includes(grade)).map((grade) => ({
    grade,
    cells: getKanjiByGrade(grade).map(({ character }) => {
      const state = stateMap.get(character);
      const practiced = !!state && (state.reading.presentations > 0 || state.writing.presentations > 0);
      let status: CollectionStatus;
      if (isKanjiCollected(state)) status = "collected";
      else if (!withQuestions.has(character)) status = "preparing";
      else if (state?.learned === false) status = "notTaught";
      else status = practiced ? "practiced" : "notYet";
      return { key: character, label: character, status };
    }),
  }));
}

// ---- Units ---------------------------------------------------------------

/** First-try-correct questions needed, per unit, before it counts as collected. */
export const UNIT_COLLECT_THRESHOLD = 3;

export type UnitCollectionSection = { category: UnitCategory; cells: CollectionCell[] };

export function unitCollection(
  attempts: StudyAttempt[],
  questions: UnitQuestion[],
  unlearnedGroups: readonly string[],
  grades: readonly SelectableGrade[],
  retired: RetiredUnitQuestion[] = [],
): UnitCollectionSection[] {
  // Answers to retired questions still count, so taking a question out of the
  // pack never takes a collected unit away. Reachability uses live questions.
  const questionMap = new Map<string, { id: string; requiredUnits: string[] }>(
    [...retired, ...questions].map((question) => [question.id, question]),
  );
  const correctQuestions = new Map<string, Set<string>>();
  const triedUnits = new Set<string>();
  for (const attempt of attempts) {
    if (attempt.subject !== "units") continue;
    const question = questionMap.get(attempt.questionId);
    if (!question) continue;
    for (const unit of question.requiredUnits) {
      triedUnits.add(unit);
      if (attempt.firstTryCorrect) {
        const set = correctQuestions.get(unit) ?? new Set<string>();
        set.add(question.id);
        correctQuestions.set(unit, set);
      }
    }
  }
  return UNIT_CATEGORIES.map((category) => ({
    category,
    cells: UNIT_DEFINITIONS.filter((unit) => unit.category === category).map((unit) => {
      const using = questions.filter((question) => question.requiredUnits.includes(unit.id));
      const reachable = using.some((question) => isUnitQuestionAllowed(question, [...unlearnedGroups])
        && (grades as readonly number[]).includes(question.grade));
      let status: CollectionStatus;
      if ((correctQuestions.get(unit.id)?.size ?? 0) >= UNIT_COLLECT_THRESHOLD) status = "collected";
      else if (using.length === 0) status = "preparing";
      else if (!reachable) status = "notTaught";
      else status = triedUnits.has(unit.id) ? "practiced" : "notYet";
      return { key: unit.id, label: unit.label, status };
    }),
  }));
}

// ---- Prefectures ---------------------------------------------------------

export function prefectureCollection(
  attempts: StudyAttempt[],
  questions: JapanMapQuestion[],
  grades: readonly SelectableGrade[],
): CollectionCell<JapanMapPrefectureId>[] {
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const collected = new Set<string>();
  const tried = new Set<string>();
  for (const attempt of attempts) {
    if (attempt.subject !== "japan-map") continue;
    const question = questionMap.get(attempt.questionId);
    // Only the location and map-based name questions count (ADR-0015 addendum).
    if (!question || !countsTowardPrefectureCollection(question)) continue;
    tried.add(question.prefectureId);
    if (attempt.firstTryCorrect) collected.add(question.prefectureId);
  }
  const withQuestions = new Set(questions.map((question) => question.prefectureId));
  // The map quiz only runs with grade 4 selected (japanMapSession.ts).
  const reachable = grades.includes(4);
  return JAPAN_MAP_PREFECTURE_IDS.map((id) => {
    const answer = questions.find((question) => question.prefectureId === id)?.answer ?? id;
    let status: CollectionStatus;
    if (collected.has(id)) status = "collected";
    else if (!withQuestions.has(id)) status = "preparing";
    else if (!reachable) status = "notTaught";
    else status = tried.has(id) ? "practiced" : "notYet";
    return { key: id, label: answer, status };
  });
}

// ---- Pets ----------------------------------------------------------------

export type PetCollectionEntry = { species: PetSpeciesId; stagesReached: number; completed: boolean };

export function petCollection(state: MotivationState): PetCollectionEntry[] {
  return PET_SPECIES.map((species) => {
    if (state.completedPets.some((pet) => pet.species === species)) {
      return { species, stagesReached: GROWTH_STAGE_COUNT, completed: true };
    }
    if (state.activePetSpecies === species) {
      return { species, stagesReached: growthStage(state.activePetInvestedPoints), completed: false };
    }
    return { species, stagesReached: 0, completed: false };
  });
}

// ---- Badges --------------------------------------------------------------

/**
 * Questions finished correctly. A question that took several tries leaves
 * several attempts, so session attempts count once per session item.
 */
export function countCompletedQuestions(attempts: StudyAttempt[]): number {
  const keys = new Set<string>();
  for (const attempt of attempts) {
    if (attempt.correct) keys.add(attempt.sessionItemId ?? attempt.id);
  }
  return keys.size;
}

export function countStudyDays(attempts: StudyAttempt[]): number {
  return new Set(attempts.map((attempt) => getLocalDate(new Date(attempt.answeredAt)))).size;
}

export type BadgeStats = {
  completedQuestions: number;
  studyDays: number;
  kanji: CollectionSummary;
  units: CollectionSummary;
  prefectures: CollectionSummary;
  completedPets: number;
};

export type Badge = {
  id: string;
  group: string;
  title: string;
  target: number;
  current: number;
  achieved: boolean;
};

/**
 * Cumulative milestones only: no streaks, rankings or lotteries, nothing is
 * taken back, and badges never award points (ADR-0012). The last badge in a
 * collection group targets what is actually available, so it is reachable.
 */
export function badges(stats: BadgeStats): Badge[] {
  const list: Badge[] = [];
  const add = (group: string, id: string, title: string, target: number, current: number) => {
    if (target <= 0) return;
    list.push({ id, group, title, target, current: Math.min(current, target), achieved: current >= target });
  };
  const collectionGroup = (group: string, id: string, unit: string, steps: number[], summary: CollectionSummary, allTitle: string) => {
    steps.filter((step) => step < summary.available).forEach((step) => add(group, `${id}-${step}`, `${unit}${step}`, step, summary.collected));
    add(group, `${id}-all`, allTitle, summary.available, summary.collected);
  };

  [10, 50, 100, 300, 500, 1000].forEach((step) => add("もんだい", `questions-${step}`, `${step}問とけた`, step, stats.completedQuestions));
  [1, 5, 10, 30, 50, 100].forEach((step) => add("がくしゅう", `days-${step}`, step === 1 ? "はじめの1日" : `${step}日がくしゅう`, step, stats.studyDays));
  collectionGroup("漢字", "kanji", "漢字", [10, 50, 100, 200, 300], stats.kanji, "漢字ぜんぶ");
  collectionGroup("たんい", "units", "たんい", [1, 5, 10], stats.units, "たんいぜんぶ");
  collectionGroup("都道府県", "prefectures", "都道府県", [1, 10, 20, 30], stats.prefectures, "都道府県ぜんぶ");
  [1, 2, 3].forEach((step) => add("なかま", `pets-${step}`, `なかま${step}ひき`, step, stats.completedPets));
  return list;
}
