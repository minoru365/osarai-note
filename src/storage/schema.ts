export const STUDY_DB_NAME = "study-support";
export const STUDY_DB_VERSION = 2;

export const STORE_NAMES = {
  attempts: "attempts",
  kanjiStates: "kanjiStates",
  customQuestions: "customQuestions",
  sessions: "sessions",
  settings: "settings",
} as const;

export type CharacterAttemptResult = {
  character: string;
  mistakes: number;
  usedGuide: boolean;
};

export type StudyAttempt = {
  id: string;
  sessionId: string;
  questionId: string;
  subject: "kanji" | "units" | "fractions" | "japan-map" | "science";
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

export type KanjiSessionAttempt = StudyAttempt & {
  subject: "kanji";
  mode: KanjiStudyMode;
  sessionItemId: string;
  targetKanji: string[];
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

export type SaveAttemptResult = "added" | "duplicate";
