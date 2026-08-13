export const STUDY_DB_NAME = "study-support";
export const STUDY_DB_VERSION = 1;

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
};

export type KanjiState = {
  kanji: string;
  learned: boolean;
  readingMastery: number;
  writingMastery: number;
  nextReviewAt: string | null;
  updatedAt: string;
};

export type AppSettings = {
  id: "app";
  dailyQuestionCount: number;
  updatedAt: string;
};

export type SaveAttemptResult = "added" | "duplicate";
