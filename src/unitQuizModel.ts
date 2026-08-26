// Answer handling for a units question, kept out of the component so the
// rules can be tested without a DOM.

import { isNumericAnswerCorrect, type UnitQuestion } from "./unitContent";

export type UnitAnswerState = {
  entry: string;
  chosenId: string | null;
  mistakes: number;
  usedGuide: boolean;
  /** Answer revealed by "分からない"; must be hidden again before continuing. */
  revealed: boolean;
  solved: boolean;
};

export function createUnitAnswerState(): UnitAnswerState {
  return { entry: "", chosenId: null, mistakes: 0, usedGuide: false, revealed: false, solved: false };
}

export function isAnswerCorrect(question: UnitQuestion, answer: string): boolean {
  return question.answerType === "numeric"
    ? isNumericAnswerCorrect(question, answer)
    : answer === question.answerChoiceId;
}

/**
 * Applies one submitted answer. A wrong answer counts a mistake and clears the
 * entry so the child can retry; the question is only solved on a correct one.
 */
export function submitUnitAnswer(
  state: UnitAnswerState,
  question: UnitQuestion,
  answer: string,
): UnitAnswerState {
  if (state.solved || state.revealed) return state;
  if (isAnswerCorrect(question, answer)) {
    return { ...state, entry: "", chosenId: null, solved: true };
  }
  return { ...state, entry: "", chosenId: null, mistakes: state.mistakes + 1 };
}

/** "分からない": one mistake, show the answer, and require a real attempt after. */
export function revealUnitAnswer(state: UnitAnswerState): UnitAnswerState {
  if (state.solved || state.revealed) return state;
  return {
    ...state,
    entry: "",
    chosenId: null,
    revealed: true,
    // Only the first reveal counts, matching the kanji rule in ADR-0002.
    mistakes: state.usedGuide ? state.mistakes : state.mistakes + 1,
    usedGuide: true,
  };
}

export function hideUnitAnswer(state: UnitAnswerState): UnitAnswerState {
  return state.revealed ? { ...state, revealed: false } : state;
}

/** True once the child has finished this question and may move on. */
export function canAdvance(state: UnitAnswerState): boolean {
  return state.solved;
}

export type UnitAttemptInput = {
  answer: string;
  correct: boolean;
  mistakes: number;
  usedGuide: boolean;
  firstTryCorrect: boolean;
};

/**
 * The payload for one submission. Every submission is persisted, as kanji does,
 * so `mistakes` is this attempt's delta rather than the running total.
 */
export function toAttemptInput(
  before: UnitAnswerState,
  question: UnitQuestion,
  answer: string,
): UnitAttemptInput {
  const correct = isAnswerCorrect(question, answer);
  return {
    answer,
    correct,
    mistakes: correct ? 0 : 1,
    usedGuide: false,
    firstTryCorrect: correct && before.mistakes === 0 && !before.usedGuide,
  };
}

/** The payload for pressing "分からない". */
export function toRevealAttemptInput(before: UnitAnswerState): UnitAttemptInput {
  return {
    answer: "",
    correct: false,
    // A second reveal on the same question must not count twice.
    mistakes: before.usedGuide ? 0 : 1,
    usedGuide: true,
    firstTryCorrect: false,
  };
}
