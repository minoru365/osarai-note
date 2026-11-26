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

import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * Amounts for downward conversions. 1 and other single round numbers made
 * "1kgは何g" style questions that only append zeros (2026-11-27 feedback:
 * too easy), so most values are two digits.
 */
const CONVERSION_VALUES = [3, 7, 12, 25, 40];
/** Answers, in the larger unit, for questions that convert upwards. */
const UPWARD_ANSWERS = [2, 4, 6, 9, 15];
const COMPARISON_VALUES = [2, 3, 5, 7];

/**
 * Adjacent power-of-ten pairs (cm-mm, L-dL) only shift a decimal place, so
 * plain conversions use them sparingly; the compound and decimal formats
 * already cover them. Conversions favour time (x60, x24) and pairs one unit
 * apart (m-mm, L-mL), which need a real calculation.
 */
function isShiftOnly(big, small) {
  const ratio = big.baseFactor / small.baseFactor;
  return ratio === 10;
}

/**
 * Keeps up to `cap` questions while visiting every unit pair in turn, so the
 * cap does not simply keep whichever pairs were generated first.
 */
function spread(questions, cap) {
  const groups = new Map();
  for (const question of questions) {
    const key = question.requiredUnits.join(":");
    groups.set(key, [...(groups.get(key) ?? []), question]);
  }
  const lists = [...groups.values()];
  const picked = [];
  for (let round = 0; picked.length < cap && lists.some((list) => list.length > round); round += 1) {
    for (const list of lists) {
      if (picked.length >= cap) break;
      if (list[round]) picked.push(list[round]);
    }
  }
  return picked;
}

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
    id: `units:conversion2:${from.id}:${to.id}:${key}`,
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
      const [big, small] = from.baseFactor > to.baseFactor ? [from, to] : [to, from];
      if (isShiftOnly(big, small)) continue;

      if (from.baseFactor > to.baseFactor) {
        // Downwards: a whole amount of the larger unit, always a whole answer.
        for (const value of CONVERSION_VALUES) {
          const question = conversionQuestion(
            category, grade, from, to, value * from.baseFactor, String(value),
          );
          if (question) questions.push(question);
        }
      } else {
        // Upwards by a power of ten ("9000kgは何t") only strips zeros, and the
        // compound formats already ask it with a remainder; keep upward
        // conversions for time, where 60 and 24 need a real division.
        if (Number.isInteger(Math.log10(ratio))) continue;
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
  return spread(questions, MAX_PER_CATEGORY_PER_TYPE);
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
        const bigBase = value * bigger.baseFactor;
        const inSmaller = bigBase / smaller.baseFactor;
        // Keep the two amounts within a few percent, and let the smaller unit
        // win about half the time. Before 2026-11-27 the larger unit always
        // won, so a child could score by picking the bigger unit.
        const step = inSmaller >= 2000 ? 50 : inSmaller >= 200 ? 10 : inSmaller >= 50 ? 2 : 1;
        const id = `units:comparison2:${bigger.id}:${smaller.id}:${value}`;
        const smallerWins = stableHash(`${id}:winner`) % 2 === 0;
        const smallBase = (inSmaller + (smallerWins ? step : -step)) * smaller.baseFactor;
        if (smallBase <= 0 || smallBase === bigBase) continue;
        if (!canRender(bigBase, bigger.id) || !canRender(smallBase, smaller.id)) continue;

        const bigLabel = formatQuantity(bigBase, bigger.id);
        const smallLabel = formatQuantity(smallBase, smaller.id);
        const winnerLabel = smallerWins ? smallLabel : bigLabel;
        // Alternate which side is shown first, independently of the winner.
        const bigFirst = stableHash(`${id}:order`) % 2 === 0;
        const [first, second] = bigFirst ? [bigLabel, smallLabel] : [smallLabel, bigLabel];

        questions.push({
          id,
          grade,
          unitCategory: category,
          questionType: "comparison",
          prompt: `${first}と ${second}、大きいのはどちらですか。`,
          explanation: `${bigLabel} は ${formatQuantity(bigBase, smaller.id)} なので、${winnerLabel} のほうが大きいです。`,
          requiredUnits: [bigger.id, smaller.id],
          answerType: "choice",
          choices: [
            { id: "left", label: first },
            { id: "right", label: second },
          ],
          answerChoiceId: winnerLabel === first ? "left" : "right",
        });
      }
    }
  }
  return spread(questions, MAX_PER_CATEGORY_PER_TYPE);
}


/**
 * Whole parts and remainders for compound amounts, by the ratio between the
 * two units. Remainders include internal zeros (2km45m = 2045m) and uneven
 * amounts, and time uses base 60 and 24, which is where children slip.
 * Before 2026-11-27 every remainder was a round tenth (1km500m), which only
 * asked a child to write digits side by side.
 */
const COMPOUND_WHOLES = [2, 3, 4, 6, 1, 12];
const COMPOUND_REMAINDERS = {
  10: [7, 4, 5, 3, 8, 6],
  24: [6, 18, 4, 15, 9, 20],
  60: [15, 45, 5, 50, 8, 36],
  100: [5, 30, 8, 75, 6, 40],
  1000: [45, 80, 5, 250, 608, 30],
};

function compoundAmounts(ratio) {
  const remainders = COMPOUND_REMAINDERS[ratio] ?? [];
  return remainders.map((remainder, index) => [COMPOUND_WHOLES[index % COMPOUND_WHOLES.length], remainder]);
}

/** Numerators for a decimal answer, over a ratio of 10 or 100. */
const DECIMAL_NUMERATORS = [2, 3, 5, 8, 15, 16, 27, 35];

/** Pairs of units one step apart, larger first, within a factor of 1000. */
function adjacentPairs(category) {
  const units = [...unitsForCategory(category)].sort((a, b) => a.baseFactor - b.baseFactor);
  const pairs = [];
  for (let index = 0; index + 1 < units.length; index++) {
    const small = units[index];
    const big = units[index + 1];
    const ratio = big.baseFactor / small.baseFactor;
    if (!Number.isSafeInteger(ratio) || ratio < 10 || ratio > 1000) continue;
    pairs.push({ big, small, ratio });
  }
  return pairs;
}

/**
 * "8mm は何cm ですか" with the answer 0.8. The plain conversion generator
 * builds upwards from whole answers on purpose, so without this format the
 * pack never asks for a decimal at all, even though the keypad has a point
 * and docs/units-plan.md 3.1 expects grade 4 to use it.
 */
function decimalConversionQuestions(category) {
  const questions = [];
  for (const { big, small, ratio } of adjacentPairs(category)) {
    // Only powers of ten: a decimal of a minute is not how time is written,
    // and only these read as the "10等分した1つ分" the drill teaches.
    if (ratio !== 10 && ratio !== 100) continue;
    const grade = Math.max(4, questionGrade([big, small]));
    if (grade > 4) continue;
    for (const numerator of DECIMAL_NUMERATORS) {
      if (numerator % ratio === 0) continue;
      // Keep the answer at 0.1 or more; 0.02cm is a sliver, not a lesson.
      if (numerator * 10 < ratio) continue;
      const baseValue = numerator * small.baseFactor;
      if (!canRender(baseValue, small.id) || !canRender(baseValue, big.id)) continue;
      questions.push({
        id: `units:decimal:${small.id}:${big.id}:${numerator}`,
        grade,
        unitCategory: category,
        questionType: "decimalConversion",
        prompt: `${formatQuantity(baseValue, small.id)}は 何${big.label}ですか。`,
        explanation: `1${small.label} = ${formatQuantity(small.baseFactor, big.id)} だから、`
          + `${formatQuantity(baseValue, small.id)} は ${formatQuantity(baseValue, big.id)} です。`,
        requiredUnits: [small.id, big.id],
        answerType: "numeric",
        answerUnit: big.id,
        answerBaseValue: baseValue,
      });
    }
  }
  return spread(questions, MAX_PER_CATEGORY_PER_TYPE);
}

/**
 * "2800m は 2km と何m ですか". docs/units-plan.md 3.1 rules out answers made of
 * two numbers, so the larger part is given and only the remainder is asked.
 */
function compoundPartQuestions(category) {
  const questions = [];
  for (const { big, small, ratio } of adjacentPairs(category)) {
    const grade = questionGrade([big, small]);
    if (grade > 4) continue;
    for (const [wholes, remainder] of compoundAmounts(ratio)) {
      if (remainder <= 0 || remainder >= ratio) continue;
      const baseValue = (wholes * ratio + remainder) * small.baseFactor;
      if (!canRender(baseValue, small.id)) continue;
      questions.push({
        id: `units:compound-part2:${small.id}:${big.id}:${wholes}-${remainder}`,
        grade,
        unitCategory: category,
        questionType: "compoundPart",
        prompt: `${formatQuantity(baseValue, small.id)}は `
          + `${formatQuantity(wholes * big.baseFactor, big.id)}と何${small.label}ですか。`,
        explanation: `${formatQuantity(wholes * big.baseFactor, big.id)} は `
          + `${formatQuantity(wholes * big.baseFactor, small.id)} だから、のこりは `
          + `${formatQuantity(remainder * small.baseFactor, small.id)} です。`,
        requiredUnits: [small.id, big.id],
        answerType: "numeric",
        answerUnit: small.id,
        answerBaseValue: remainder * small.baseFactor,
      });
    }
  }
  return spread(questions, MAX_PER_CATEGORY_PER_TYPE);
}

/**
 * "5cm4mm は何mm ですか" and, for grade 4, the same amount as a decimal of the
 * larger unit. The child reads a compound amount and answers with one number.
 */
function compoundToSingleQuestions(category) {
  const questions = [];
  for (const { big, small, ratio } of adjacentPairs(category)) {
    const baseGrade = questionGrade([big, small]);
    if (baseGrade > 4) continue;
    for (const [wholes, remainder] of compoundAmounts(ratio)) {
      if (remainder <= 0 || remainder >= ratio) continue;
      const baseValue = (wholes * ratio + remainder) * small.baseFactor;
      const compound = `${formatQuantity(wholes * big.baseFactor, big.id)}`
        + `${formatQuantity(remainder * small.baseFactor, small.id)}`;
      if (!canRender(baseValue, small.id)) continue;

      questions.push({
        id: `units:compound-single2:${small.id}:${big.id}:${wholes}-${remainder}`,
        grade: baseGrade,
        unitCategory: category,
        questionType: "compoundToSingle",
        prompt: `${compound}は 何${small.label}ですか。`,
        explanation: `${formatQuantity(wholes * big.baseFactor, big.id)} は `
          + `${formatQuantity(wholes * big.baseFactor, small.id)} だから、あわせて `
          + `${formatQuantity(baseValue, small.id)} です。`,
        requiredUnits: [small.id, big.id],
        answerType: "numeric",
        answerUnit: small.id,
        answerBaseValue: baseValue,
      });

      // The same amount written as a decimal of the larger unit (grade 4).
      if ((ratio === 10 || ratio === 100) && canRender(baseValue, big.id)) {
        questions.push({
          id: `units:compound-decimal2:${small.id}:${big.id}:${wholes}-${remainder}`,
          grade: 4,
          unitCategory: category,
          questionType: "compoundToSingle",
          prompt: `${compound}は 何${big.label}ですか。`,
          explanation: `${formatQuantity(remainder * small.baseFactor, small.id)} は `
            + `${formatQuantity(remainder * small.baseFactor, big.id)} だから、あわせて `
            + `${formatQuantity(baseValue, big.id)} です。`,
          requiredUnits: [small.id, big.id],
          answerType: "numeric",
          answerUnit: big.id,
          answerBaseValue: baseValue,
        });
      }
    }
  }
  return spread(questions, MAX_PER_CATEGORY_PER_TYPE);
}

/**
 * "2045mは 何km何mですか": the child answers with two whole numbers, one box
 * per unit (units-plan 3.1, 2026-11-27). Uses the same remainders as the
 * other compound formats, so internal zeros and base 60/24 appear here too.
 */
function compoundSplitQuestions(category) {
  const questions = [];
  for (const { big, small, ratio } of adjacentPairs(category)) {
    const grade = questionGrade([big, small]);
    if (grade > 4) continue;
    for (const [wholes, remainder] of compoundAmounts(ratio)) {
      if (remainder <= 0 || remainder >= ratio) continue;
      const baseValue = (wholes * ratio + remainder) * small.baseFactor;
      if (!canRender(baseValue, small.id)) continue;
      const wholePart = formatQuantity(wholes * big.baseFactor, big.id);
      const rest = formatQuantity(remainder * small.baseFactor, small.id);
      questions.push({
        id: `units:compound-split:${small.id}:${big.id}:${wholes}-${remainder}`,
        grade,
        unitCategory: category,
        questionType: "compoundSplit",
        prompt: `${formatQuantity(baseValue, small.id)}は 何${big.label}何${small.label}ですか。`,
        explanation: `${formatQuantity(wholes * big.baseFactor, small.id)} が ${wholePart} だから、`
          + `${formatQuantity(baseValue, small.id)} は ${wholePart}${rest} です。`,
        requiredUnits: [small.id, big.id],
        answerType: "compound",
        answerUnits: [big.id, small.id],
        answerBaseValue: baseValue,
      });
    }
  }
  return spread(questions, MAX_PER_CATEGORY_PER_TYPE);
}

const materials = readMaterials(MATERIALS);

const questions = [
  ...UNIT_CATEGORIES.flatMap((category) => [
    ...conversionQuestions(category),
    ...comparisonQuestions(category),
    ...decimalConversionQuestions(category),
    ...compoundPartQuestions(category),
    ...compoundToSingleQuestions(category),
    ...compoundSplitQuestions(category),
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

/**
 * Questions dropped from the pack stay listed in `retiredQuestions` (ADR-0015
 * addendum). The collections resolve old answers through it, so a unit the
 * child already collected never loses its colour when a question is retired.
 * Selection only ever reads `questions`. The list is cumulative.
 */
const previous = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, "utf8")) : { questions: [], retiredQuestions: [] };
const previousRetired = previous.retiredQuestions ?? [];
const fingerprint = (question) => JSON.stringify([
  question.prompt, question.answerType, question.answerBaseValue ?? null, question.answerUnit ?? null,
  question.choices ?? null, question.answerChoiceId ?? null, question.requiredUnits, question.answerUnits ?? null,
]);
const previousById = new Map(previous.questions.map((question) => [question.id, question]));
const retiredIds = new Set(previousRetired.map((question) => question.id));
for (const question of published) {
  // An ID must never come back meaning a different question: old answers
  // would silently attach to it.
  const before = previousById.get(question.id);
  if (before && fingerprint(before) !== fingerprint(question)) {
    throw new Error(`同じ問題IDで中身が変わっています: ${question.id}`);
  }
  if (retiredIds.has(question.id)) {
    throw new Error(`退役した問題IDを使い回しています: ${question.id}`);
  }
}
const publishedIds = new Set(published.map((question) => question.id));
const retiredQuestions = [
  ...previousRetired,
  ...previous.questions
    .filter((question) => !publishedIds.has(question.id))
    .map(({ id, unitCategory, questionType, requiredUnits }) => ({ id, unitCategory, questionType, requiredUnits })),
];

writeFileSync(
  OUTPUT,
  `${JSON.stringify({ schemaVersion: 1, packId: "units-v1", questions: published, retiredQuestions }, null, 2)}\n`,
  "utf8",
);
console.log(`retired: ${retiredQuestions.length}`);

const byType = published.reduce((counts, question) => {
  counts[question.questionType] = (counts[question.questionType] ?? 0) + 1;
  return counts;
}, {});
console.log(`generated ${OUTPUT}`);
console.log(`questions: ${published.length}`, byType);
console.log("reviewed material:", countByStatus(materials));
