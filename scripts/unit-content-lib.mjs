// Builders for the units question types that come from reviewed material
// (docs/units-plan.md 7.2). Shared by the pack generator and the review
// renderer so a reviewer always reads exactly what a child would see.

import { readFileSync } from "node:fs";
import {
  formatBaseValue,
  formatQuantity,
  getUnit,
  isUnitAvailableForGrade,
} from "../src/units.ts";

const REVIEW_STATUSES = ["draft", "approved", "needs-fix"];

export function readMaterials(path) {
  const materials = JSON.parse(readFileSync(path, "utf8"));
  if (materials.schemaVersion !== 1) throw new Error("素材ファイルの形式が不正です");
  return materials;
}

/** FNV-1a, so per-question choice order is fixed but varies across questions. */
export function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function orderChoices(seed, choices) {
  return [...choices].sort((left, right) =>
    stableHash(`${seed}:${left.id}`) - stableHash(`${seed}:${right.id}`));
}

function selectEntries(entries, includeDrafts) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) throw new Error(`素材IDが重複しています: ${entry.id}`);
    seen.add(entry.id);
    if (!REVIEW_STATUSES.includes(entry.reviewStatus)) {
      throw new Error(`${entry.id}: reviewStatus が不正です`);
    }
    if (entry.grade !== 3 && entry.grade !== 4) throw new Error(`${entry.id}: 学年が不正です`);
    if (entry.reviewStatus === "needs-fix") return false;
    return includeDrafts || entry.reviewStatus === "approved";
  });
}

function assertUnitUsable(id, unitId, category, grade) {
  const unit = getUnit(unitId);
  if (unit.category !== category) throw new Error(`${id}: 単位 ${unitId} が系統と一致しません`);
  if (!isUnitAvailableForGrade(unitId, grade)) {
    throw new Error(`${id}: ${grade}年生で未習の単位 ${unitId} を使っています`);
  }
}

function appropriateUnitQuestion(entry) {
  const units = [entry.answerUnit, ...entry.distractors];
  units.forEach((unitId) => assertUnitUsable(entry.id, unitId, entry.unitCategory, entry.grade));
  if (new Set(units).size !== units.length) throw new Error(`${entry.id}: 選択肢の単位が重複しています`);

  return {
    id: `units:appropriateUnit:${entry.id}`,
    materialId: entry.id,
    grade: entry.grade,
    unitCategory: entry.unitCategory,
    questionType: "appropriateUnit",
    // 「単位」は4年生の配当漢字なので、3年生の問題にも出せるようかなで書く。
    prompt: `${entry.target}は、どのたんいではかりますか。`,
    explanation: `${entry.target}は ${getUnit(entry.answerUnit).label} ではかります。`,
    requiredUnits: units,
    answerType: "choice",
    choices: orderChoices(entry.id, units.map((unitId) => ({
      id: unitId,
      label: getUnit(unitId).label,
    }))),
    answerChoiceId: entry.answerUnit,
  };
}

function senseEstimateQuestion(entry) {
  const answer = entry.choices[entry.answerIndex];
  if (!answer) throw new Error(`${entry.id}: answerIndex が選択肢の範囲外です`);
  if (answer.baseValue !== entry.answerBaseValue) {
    throw new Error(`${entry.id}: answerBaseValue と選択肢が一致しません`);
  }
  const values = entry.choices.map((choice) => choice.baseValue);
  if (new Set(values).size !== values.length) throw new Error(`${entry.id}: 選択肢の量が重複しています`);
  entry.choices.forEach((choice) => {
    assertUnitUsable(entry.id, choice.unit, entry.unitCategory, entry.grade);
    formatBaseValue(choice.baseValue, choice.unit);
  });

  return {
    id: `units:senseEstimate:${entry.id}`,
    materialId: entry.id,
    grade: entry.grade,
    unitCategory: entry.unitCategory,
    questionType: "senseEstimate",
    prompt: `${entry.target}は、だいたいどれくらいですか。`,
    explanation: `${entry.target}は だいたい ${formatQuantity(answer.baseValue, answer.unit)} です。`,
    requiredUnits: [...new Set(entry.choices.map((choice) => choice.unit))],
    answerType: "choice",
    choices: orderChoices(entry.id, entry.choices.map((choice) => ({
      id: `${choice.baseValue}`,
      label: formatQuantity(choice.baseValue, choice.unit),
    }))),
    answerChoiceId: `${answer.baseValue}`,
  };
}

function wordProblemQuestion(entry) {
  assertUnitUsable(entry.id, entry.answerUnit, entry.unitCategory, entry.grade);
  if (!Number.isSafeInteger(entry.answerBaseValue) || entry.answerBaseValue <= 0) {
    throw new Error(`${entry.id}: 答えが正の整数ではありません`);
  }
  // Throws when the answer cannot be shown as a decimal of the answer unit.
  const shown = formatBaseValue(entry.answerBaseValue, entry.answerUnit);
  // The explanation must contain the answer, so a mistyped answerBaseValue
  // cannot silently disagree with the worked solution.
  if (!entry.explanation.includes(shown)) {
    throw new Error(`${entry.id}: 説明に答え ${shown} が現れません`);
  }

  return {
    id: `units:wordProblem:${entry.id}`,
    materialId: entry.id,
    grade: entry.grade,
    unitCategory: entry.unitCategory,
    questionType: "wordProblem",
    prompt: entry.prompt,
    explanation: entry.explanation,
    requiredUnits: [entry.answerUnit],
    answerType: "numeric",
    answerUnit: entry.answerUnit,
    answerBaseValue: entry.answerBaseValue,
    answerText: formatQuantity(entry.answerBaseValue, entry.answerUnit),
  };
}

export function buildReviewedQuestions(materials, { includeDrafts = false } = {}) {
  return [
    ...selectEntries(materials.appropriateUnit ?? [], includeDrafts).map(appropriateUnitQuestion),
    ...selectEntries(materials.senseEstimate ?? [], includeDrafts).map(senseEstimateQuestion),
    ...selectEntries(materials.wordProblem ?? [], includeDrafts).map(wordProblemQuestion),
  ];
}

export function countByStatus(materials) {
  const counts = { draft: 0, approved: 0, "needs-fix": 0 };
  ["appropriateUnit", "senseEstimate", "wordProblem"].forEach((kind) => {
    (materials[kind] ?? []).forEach((entry) => {
      counts[entry.reviewStatus] = (counts[entry.reviewStatus] ?? 0) + 1;
    });
  });
  return counts;
}
