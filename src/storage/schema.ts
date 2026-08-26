export const STUDY_DB_NAME = "study-support";
export const STUDY_DB_VERSION = 4;

export const STORE_NAMES = {
  attempts: "attempts",
  kanjiStates: "kanjiStates",
  customQuestions: "customQuestions",
  sessions: "sessions",
  settings: "settings",
  motivation: "motivation",
  unitStates: "unitStates",
} as const;

// Single source of truth for the subjects the app knows about (ADR-0007).
// Used by attempts, daily sessions, and the content manifest alike.
export const SUBJECTS = ["kanji", "units", "fractions", "japan-map", "science"] as const;
export type Subject = typeof SUBJECTS[number];

export function isSubject(value: unknown): value is Subject {
  return typeof value === "string" && (SUBJECTS as readonly string[]).includes(value);
}

export type CharacterAttemptResult = {
  character: string;
  mistakes: number;
  usedGuide: boolean;
};

export type StudyAttempt = {
  id: string;
  sessionId: string;
  questionId: string;
  subject: Subject;
  mode: "reading" | "writing" | "quiz";
  answer: string;
  correct: boolean;
  mistakes: number;
  usedGuide: boolean;
  answeredAt: string;
  characterResults?: CharacterAttemptResult[];
  sessionItemId?: string;
  targetKanji?: string[];
  firstTryCorrect?: boolean;
};

export type KanjiSkillStats = {
  presentations: number;
  firstTryCorrect: number;
  mistakePresentations: number;
  unknownCount: number;
  strokeMistakes: number;
  weakness: number;
  lastPresentedAt: string | null;
  lastFirstTryCorrectAt: string | null;
};

export function createEmptyKanjiSkillStats(): KanjiSkillStats {
  return {
    presentations: 0,
    firstTryCorrect: 0,
    mistakePresentations: 0,
    unknownCount: 0,
    strokeMistakes: 0,
    weakness: 0,
    lastPresentedAt: null,
    lastFirstTryCorrectAt: null,
  };
}

export type KanjiState = {
  kanji: string;
  learned: boolean;
  reading: KanjiSkillStats;
  writing: KanjiSkillStats;
  updatedAt: string;
  // v1 fields are retained on migrated records so the upgrade never discards data.
  readingMastery?: number;
  writingMastery?: number;
  nextReviewAt?: string | null;
};

// Units weakness aggregate, keyed by `unitCategory:questionType` (ADR-0007).
// Kept in its own store because the key space does not map onto kanji's.
export type UnitState = {
  key: string;
  presentations: number;
  firstTryCorrect: number;
  mistakePresentations: number;
  unknownCount: number;
  weakness: number;
  lastPresentedAt: string | null;
  lastFirstTryCorrectAt: string | null;
  updatedAt: string;
};

export function createEmptyUnitState(key: string, updatedAt: string): UnitState {
  return {
    key,
    presentations: 0,
    firstTryCorrect: 0,
    mistakePresentations: 0,
    unknownCount: 0,
    weakness: 0,
    lastPresentedAt: null,
    lastFirstTryCorrectAt: null,
    updatedAt,
  };
}

export type KanjiStudyMode = "reading" | "writing";
export type SkillImpact = "increase" | "decrease";
export type DailySessionItemStatus = "pending" | "in-progress" | "completed";

export type DailySessionItem = {
  id: string;
  questionId: string;
  status: DailySessionItemStatus;
  mistakeCount: number;
  usedGuide: boolean;
  impacts: Record<string, SkillImpact>;
  unknownKanji: string[];
  completedAt: string | null;
};

export type DailyKanjiSession = {
  id: string;
  // Absent on records written before DB v4; read back as "kanji" (ADR-0007).
  subject: "kanji";
  localDate: string;
  mode: KanjiStudyMode;
  batchNumber: number;
  questionIds: string[];
  items: DailySessionItem[];
  currentIndex: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type UnitSessionItem = {
  id: string;
  questionId: string;
  status: DailySessionItemStatus;
  mistakeCount: number;
  usedGuide: boolean;
  /** `unitCategory:questionType` this question counts towards. */
  unitStateKey: string;
  /** Set once the weakness aggregate has taken this question's first result. */
  counted: boolean;
  /**
   * Set once "分からない" has been counted for this question. Tracked apart from
   * `counted` so that pressing it on a later try is still recorded, matching
   * how kanji tracks `unknownKanji`.
   */
  unknownCounted: boolean;
  completedAt: string | null;
};

export type DailyUnitSession = {
  id: string;
  subject: "units";
  localDate: string;
  mode: "quiz";
  batchNumber: number;
  questionIds: string[];
  items: UnitSessionItem[];
  currentIndex: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
};

// Widens as subjects are added; the discriminator is `subject` (ADR-0007).
export type DailyStudySession = DailyKanjiSession | DailyUnitSession;

export function isKanjiSession(session: DailyStudySession): session is DailyKanjiSession {
  return session.subject === "kanji";
}

export function isUnitSession(session: DailyStudySession): session is DailyUnitSession {
  return session.subject === "units";
}

export function dailySessionId(
  localDate: string,
  subject: Subject,
  mode: string,
  batchNumber: number,
): string {
  return `${localDate}:${subject}:${mode}:${batchNumber}`;
}

export type KanjiSessionAttempt = StudyAttempt & {
  subject: "kanji";
  mode: KanjiStudyMode;
  sessionItemId: string;
  targetKanji: string[];
  firstTryCorrect: boolean;
};

export type UnitSessionAttempt = StudyAttempt & {
  subject: "units";
  mode: "quiz";
  sessionItemId: string;
  /** `unitCategory:questionType`, the units weakness aggregate key. */
  unitStateKey: string;
  firstTryCorrect: boolean;
};

export type KanjiFreePracticeAttempt = StudyAttempt & {
  subject: "kanji";
  mode: KanjiStudyMode;
  sessionId: "free-practice";
  targetKanji: string[];
  firstTryCorrect: boolean;
};

export type AppSettings = {
  id: "app";
  dailyQuestionCount: number;
  updatedAt: string;
};

/**
 * Which units the child has not been taught yet, as `category:grade` groups
 * (docs/units-plan.md 1.2) — e.g. "area:4". Everything is treated as taught
 * until a parent marks it otherwise, matching how kanji default to learned.
 * Lives in the existing settings store, so it needs no schema version bump.
 */
export type UnitLearningSettings = {
  id: "units";
  unlearnedGroups: string[];
  updatedAt: string;
};

export function unitLearningGroup(category: string, grade: number): string {
  return `${category}:${grade}`;
}

export type SaveAttemptResult = "added" | "duplicate";

// Motivation feature (ADR-0006): a single subject-independent point ledger and
// pet growth state, kept in its own store so existing progress data never moves.
export const PET_SPECIES = ["hiyoko", "usagi"] as const;
export type PetSpeciesId = typeof PET_SPECIES[number];

export const FOOD_COSTS = [1, 3, 5] as const;
export type FoodCost = typeof FOOD_COSTS[number];

export const POINTS_PER_GROWTH_STAGE = 100;
export const GROWTH_STAGE_COUNT = 5;
export const POINTS_TO_COMPLETE_PET = POINTS_PER_GROWTH_STAGE * GROWTH_STAGE_COUNT;
export const NEGLECT_THRESHOLD_DAYS = 3;

export function growthStage(investedPoints: number): number {
  return Math.min(GROWTH_STAGE_COUNT, Math.floor(investedPoints / POINTS_PER_GROWTH_STAGE) + 1);
}

export function isPetNeglected(lastAnsweredAt: string | null, now: Date): boolean {
  if (!lastAnsweredAt) return false;
  const elapsedMs = now.getTime() - new Date(lastAnsweredAt).getTime();
  return elapsedMs >= NEGLECT_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
}

export type CompletedPet = {
  species: PetSpeciesId;
  completedAt: string;
};

export type MotivationState = {
  id: "app";
  pointsBalance: number;
  activePetSpecies: PetSpeciesId | null;
  activePetInvestedPoints: number;
  completedPets: CompletedPet[];
  lastAnsweredAt: string | null;
  updatedAt: string;
};

export function createInitialMotivationState(updatedAt: string): MotivationState {
  return {
    id: "app",
    pointsBalance: 0,
    activePetSpecies: PET_SPECIES[0],
    activePetInvestedPoints: 0,
    completedPets: [],
    lastAnsweredAt: null,
    updatedAt,
  };
}
