// Generates the machine-derivable part of the units question pack
// (docs/units-plan.md 7.1): conversion and comparison.
//
// The unit table is imported from src/units.ts rather than restated here, so
// the pack and the app can never disagree about a conversion factor. Run with
// `npm run content:generate-units`.
//
// The remaining three question types are not produced here. Appropriate-unit
// needs a human-authored list of objects to measure, and sense-of-quantity and
// word problems need full human review, so they arrive through a review batch.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KANJI_CATALOG } from "../src/kanjiCatalog.ts";
import { buildReviewedQuestions, countByStatus, readMaterials, stableHash } from "./unit-content-lib.mjs";
import {
  UNIT_CATEGORIES,
  formatBaseValue,
  formatQuantity,
  getUnit,
  unitsForCategory,
} from "../src/units.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "public", "content", "units-v1.json");
const MATERIALS = join(ROOT, "content-source", "unit-materials.json");

/** The app only teaches grades 3 and 4; earlier units are assumed known. */
const MIN_GRADE = 3;
const MAX_PER_CATEGORY_PER_TYPE = 24;

/**
 * Only relate units within a factor of 10000. Without a cap the pack asks
 * things like "1km²は何cm²ですか" (10,000,000,000) or "2km²と19999999999cm²".
 * 10000 rather than 1000 so that 1m² = 10000cm², core grade 4 material, stays.
 */
const MAX_UNIT_RATIO = 10_000;

/** Whole-number amounts that read naturally in a question. */
const CONVERSION_VALUES = [1, 2, 3, 5, 8, 12];
/** Answers, in the larger unit, for questions that convert upwards. */
const UPWARD_ANSWERS = [1, 2, 3, 5];
const COMPARISON_VALUES = [2, 3, 5];

function questionGrade(units) {
  return Math.max(MIN_GRADE, ...units.map((unit) => unit.introducedGrade));
}

function canRender(baseValue, unitId) {
  try {
    formatBaseValue(baseValue, unitId);
    return true;
  } catch {
    return false;
  }
}

function conversionQuestion(category, grade, from, to, baseValue, key) {
  if (!canRender(baseValue, from.id) || !canRender(baseValue, to.id)) return null;
  // State the relation with the larger unit first: "1km = 1000m" reads better
  // to a child than "1m = 0.001km".
  const [big, small] = from.baseFactor > to.baseFactor ? [from, to] : [to, from];
  return {
    id: `units:conversion:${from.id}:${to.id}:${key}`,
    grade,
    unitCategory: category,
    questionType: "conversion",
    prompt: `${formatQuantity(baseValue, from.id)}は 何${to.label}ですか。`,
    explanation: `1${big.label} = ${formatQuantity(big.baseFactor, small.id)} だから、`
      + `${formatQuantity(baseValue, from.id)} は ${formatQuantity(baseValue, to.id)} です。`,
    requiredUnits: [from.id, to.id],
    answerType: "numeric",
    answerUnit: to.id,
    answerBaseValue: baseValue,
  };
}

function conversionQuestions(category) {
  const units = unitsForCategory(category);
  const questions = [];

  for (const from of units) {
    for (const to of units) {
      if (from.id === to.id) continue;
      const grade = questionGrade([from, to]);
      if (grade > 4) continue;
      const ratio = from.baseFactor > to.baseFactor
        ? from.baseFactor / to.baseFactor
        : to.baseFactor / from.baseFactor;
      if (ratio > MAX_UNIT_RATIO) continue;

      if (from.baseFactor > to.baseFactor) {
        // Downwards: a whole amount of the larger unit, always a whole answer.
        for (const value of CONVERSION_VALUES) {
          const question = conversionQuestion(
            category, grade, from, to, value * from.baseFactor, String(value),
          );
          if (question) questions.push(question);
        }
      } else {
        // Upwards: build from the answer so the question never asks for a
        // sliver like 0.0001m². Halves are grade 4 material only.
        for (const answer of UPWARD_ANSWERS) {
          const whole = conversionQuestion(
            category, grade, from, to, answer * to.baseFactor, String(answer),
          );
          if (whole) questions.push(whole);

          const halfBase = answer * to.baseFactor + to.baseFactor / 2;
          if (grade >= 4 && Number.isSafeInteger(halfBase) && halfBase % from.baseFactor === 0) {
            const half = conversionQuestion(
              category, grade, from, to, halfBase, `${answer}h`,
            );
            if (half) questions.push(half);
          }
        }
      }
    }
  }
  return questions.slice(0, MAX_PER_CATEGORY_PER_TYPE);
}

function comparisonQuestions(category) {
  const units = unitsForCategory(category);
  const questions = [];

  for (const bigger of units) {
    for (const smaller of units) {
      if (bigger.baseFactor <= smaller.baseFactor) continue;
      const grade = questionGrade([bigger, smaller]);
      if (grade > 4) continue;

      if (bigger.baseFactor / smaller.baseFactor > MAX_UNIT_RATIO) continue;

      for (const value of COMPARISON_VALUES) {
        const leftBase = value * bigger.baseFactor;
        // Land just under the same amount so the larger-looking number is the
        // smaller quantity, and comparing digits alone gives the wrong answer.
        const leftInSmaller = leftBase / smaller.baseFactor;
        const step = leftInSmaller >= 200 ? 100 : leftInSmaller >= 20 ? 10 : 1;
        const rightBase = (leftInSmaller - step) * smaller.baseFactor;
        if (rightBase <= 0 || leftBase === rightBase) continue;
        if (!canRender(leftBase, bigger.id) || !canRender(rightBase, smaller.id)) continue;

        const larger = formatQuantity(leftBase, bigger.id);
        const lesser = formatQuantity(rightBase, smaller.id);
        const id = `units:comparison:${bigger.id}:${smaller.id}:${value}`;
        // Alternate which side is correct. Always putting the answer first
        // would let a child score every question by tapping the left option.
        const answerFirst = stableHash(id) % 2 === 0;
        const [first, second] = answerFirst ? [larger, lesser] : [lesser, larger];

        questions.push({
          id,
          grade,
          unitCategory: category,
          questionType: "comparison",
          prompt: `${first}と ${second}、大きいのはどちらですか。`,
          explanation: `${larger} は ${formatQuantity(leftBase, smaller.id)} なので、${larger} のほうが大きいです。`,
          requiredUnits: [bigger.id, smaller.id],
          answerType: "choice",
          choices: [
            { id: "left", label: first },
            { id: "right", label: second },
          ],
          answerChoiceId: answerFirst ? "left" : "right",
        });
      }
    }
  }
  return questions.slice(0, MAX_PER_CATEGORY_PER_TYPE);
}

const materials = readMaterials(MATERIALS);

const questions = [
  ...UNIT_CATEGORIES.flatMap((category) => [
    ...conversionQuestions(category),
    ...comparisonQuestions(category),
  ]),
  ...buildReviewedQuestions(materials),
];

const KANJI_GRADE = new Map(KANJI_CATALOG.map((entry) => [entry.character, entry.grade]));

/**
 * Grade 3 questions may only show kanji from grades 1-3, grade 4 from 1-4
 * (docs/units-plan.md 7.2). The catalog covers grades 3 and 4 only, so a kanji
 * it does not list is from grades 1-2 and always allowed.
 */
function assertKanjiWithinGrade(question) {
  const text = [
    question.prompt,
    question.explanation,
    ...(question.choices ?? []).map((choice) => choice.label),
  ].join("");
  for (const character of text) {
    const grade = KANJI_GRADE.get(character);
    if (grade !== undefined && grade > question.grade) {
      throw new Error(
        `${question.id}: ${question.grade}年生の問題に${grade}年生の漢字「${character}」を使っています`,
      );
    }
  }
}

const ids = new Set();
for (const question of questions) {
  if (ids.has(question.id)) throw new Error(`問題IDが重複しています: ${question.id}`);
  ids.add(question.id);
  // Every generated answer must be exact in base units.
  if (!Number.isSafeInteger(question.answerBaseValue ?? 0)) {
    throw new Error(`答えが整数ではありません: ${question.id}`);
  }
  assertKanjiWithinGrade(question);
}

// materialId and answerText exist for the review page; keep them out of the pack.
const published = questions.map(({ materialId, answerText, ...question }) => question);

writeFileSync(
  OUTPUT,
  `${JSON.stringify({ schemaVersion: 1, packId: "units-v1", questions: published }, null, 2)}\n`,
  "utf8",
);

const byType = published.reduce((counts, question) => {
  counts[question.questionType] = (counts[question.questionType] ?? 0) + 1;
  return counts;
}, {});
console.log(`generated ${OUTPUT}`);
console.log(`questions: ${published.length}`, byType);
console.log("reviewed material:", countByStatus(materials));
