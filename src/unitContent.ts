// Units question pack format and validation (docs/units-plan.md 4, 8, 9).

import {
  UNIT_CATEGORIES,
  UNIT_QUESTION_TYPES,
  formatBaseValue,
  getUnit,
  isUnitAvailableForGrade,
  parseQuantityToBase,
  unitStateKey,
  type UnitCategory,
  type UnitQuestionType,
} from "./units";

type UnitQuestionBase = {
  id: string;
  grade: 3 | 4;
  unitCategory: UnitCategory;
  questionType: UnitQuestionType;
  prompt: string;
  explanation: string;
  /** Every unit the question shows or expects, used for the grade gate. */
  requiredUnits: string[];
};

export type NumericUnitQuestion = UnitQuestionBase & {
  answerType: "numeric";
  /** Unit fixed on screen; the child types only the number. */
  answerUnit: string;
  /** The answer as an exact integer count of the category's base unit. */
  answerBaseValue: number;
};

export type UnitChoice = { id: string; label: string };

export type ChoiceUnitQuestion = UnitQuestionBase & {
  answerType: "choice";
  choices: UnitChoice[];
  answerChoiceId: string;
};

export type UnitQuestion = NumericUnitQuestion | ChoiceUnitQuestion;

export function getUnitStateKey(question: UnitQuestion): string {
  return unitStateKey(question.unitCategory, question.questionType);
}

/** True when the typed number matches the expected quantity exactly. */
export function isNumericAnswerCorrect(question: NumericUnitQuestion, input: string): boolean {
  const entered = parseQuantityToBase(input, question.answerUnit);
  return entered !== null && entered === question.answerBaseValue;
}

export function formatExpectedAnswer(question: NumericUnitQuestion): string {
  return formatBaseValue(question.answerBaseValue, question.answerUnit);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateQuestion(value: unknown, seen: Set<string>): UnitQuestion {
  if (!isObject(value)
    || typeof value.id !== "string" || value.id.length === 0
    || (value.grade !== 3 && value.grade !== 4)
    || typeof value.prompt !== "string" || value.prompt.length === 0
    || typeof value.explanation !== "string" || value.explanation.length === 0
    || !Array.isArray(value.requiredUnits) || value.requiredUnits.length === 0
    || !(UNIT_CATEGORIES as readonly string[]).includes(value.unitCategory as string)
    || !(UNIT_QUESTION_TYPES as readonly string[]).includes(value.questionType as string)) {
    throw new Error("単位問題の形式が不正です");
  }
  if (seen.has(value.id)) throw new Error(`問題IDが重複しています: ${value.id}`);
  seen.add(value.id);

  const grade = value.grade;
  const requiredUnits = value.requiredUnits as string[];
  requiredUnits.forEach((unitId) => {
    if (typeof unitId !== "string") throw new Error("単位問題の使用単位が不正です");
    const unit = getUnit(unitId);
    if (unit.category !== value.unitCategory) {
      throw new Error(`${value.id}: 使用単位 ${unitId} が系統と一致しません`);
    }
    if (!isUnitAvailableForGrade(unitId, grade)) {
      throw new Error(`${value.id}: ${grade}年生で未習の単位 ${unitId} を使っています`);
    }
  });

  if (value.answerType === "numeric") {
    if (typeof value.answerUnit !== "string"
      || !requiredUnits.includes(value.answerUnit)
      || typeof value.answerBaseValue !== "number"
      || !Number.isSafeInteger(value.answerBaseValue)
      || value.answerBaseValue <= 0) {
      throw new Error(`${value.id}: 数値回答の指定が不正です`);
    }
    // Throws when the quantity cannot be shown as a decimal of answerUnit,
    // which would otherwise misrender a base-60 remainder (units-plan 3.1).
    formatBaseValue(value.answerBaseValue, value.answerUnit);
    return value as unknown as NumericUnitQuestion;
  }

  if (value.answerType === "choice") {
    if (!Array.isArray(value.choices) || value.choices.length < 2 || value.choices.length > 4
      || typeof value.answerChoiceId !== "string") {
      throw new Error(`${value.id}: 選択肢の指定が不正です`);
    }
    const ids = new Set<string>();
    value.choices.forEach((choice) => {
      if (!isObject(choice) || typeof choice.id !== "string" || choice.id.length === 0
        || typeof choice.label !== "string" || choice.label.length === 0
        || ids.has(choice.id)) {
        throw new Error(`${value.id}: 選択肢の形式が不正です`);
      }
      ids.add(choice.id);
    });
    if (!ids.has(value.answerChoiceId)) {
      throw new Error(`${value.id}: 正解の選択肢がありません`);
    }
    return value as unknown as ChoiceUnitQuestion;
  }

  throw new Error(`${value.id}: 回答方法が不正です`);
}

export function validateUnitPack(value: unknown): UnitQuestion[] {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.questions)) {
    throw new Error("単位問題パックの形式が不正です");
  }
  const seen = new Set<string>();
  return value.questions.map((question) => validateQuestion(question, seen));
}
