// Checks the generated units pack. These assertions read the published file,
// so they live with the generator rather than in src: the app's tsconfig has
// no node types, and importing node:fs from src breaks `tsc -b` in CI.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UNIT_DEFINITIONS, formatBaseValue } from "../src/units.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pack = JSON.parse(readFileSync(join(ROOT, "public/content/units-v1.json"), "utf8"));
const of = (type) => pack.questions.filter((question) => question.questionType === type);
const NEW_TYPES = ["decimalConversion", "compoundPart", "compoundToSingle"];

const byLabel = new Map(UNIT_DEFINITIONS.map((unit) => [unit.label, unit]));
const LABELS = [...byLabel.keys()].sort((left, right) => right.length - left.length);
const AMOUNT = new RegExp(`([0-9.]+)\\s*(${LABELS.join("|")})`, "gu");

/** Every amount written in a prompt, converted to base units. */
function amountsIn(prompt) {
  return [...prompt.matchAll(AMOUNT)].map(([, value, label]) => (
    Number(value) * byLabel.get(label).baseFactor
  ));
}

describe("生成した単位パック", () => {
  it("参考ドリルの3形式が入っている", () => {
    for (const type of NEW_TYPES) expect(of(type).length).toBeGreaterThan(0);
  });

  it("問題文から計算した答えと、記録された答えが一致する", () => {
    const wrong = [];
    for (const type of NEW_TYPES) {
      for (const question of of(type)) {
        const amounts = amountsIn(question.prompt);
        // 「AはBと何Cですか」は残り、それ以外は書かれた量の合計が答えになる。
        const expected = question.questionType === "compoundPart"
          ? amounts[0] - amounts[1]
          : amounts.reduce((total, value) => total + value, 0);
        if (expected !== question.answerBaseValue) wrong.push(question.id);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("小数の答えは0.1以上にする", () => {
    // 0.02cm のような細かすぎる答えは学習にならない。
    for (const question of of("decimalConversion")) {
      const answer = Number(
        formatBaseValue(question.answerBaseValue, question.answerUnit).replace(/[^\d.]/gu, ""),
      );
      expect(answer).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("時間は小数で答えさせない", () => {
    // 「0.5分」は日本の算数で使う書き方ではない。
    expect(of("decimalConversion").filter((question) => question.unitCategory === "time")).toEqual([]);
  });

  it("新形式もすべて単一の数値で答える", () => {
    // docs/units-plan.md 3.1：答えが2つの数になる形式は作らない。
    for (const type of NEW_TYPES) {
      for (const question of of(type)) expect(question.answerType).toBe("numeric");
    }
  });

  it("大小比較は、大きい単位の側が勝つとは限らず、2つの量が近い", () => {
    // 2026-11-27: the larger unit used to win every time.
    const comparisons = of("comparison");
    let smallerUnitWins = 0;
    for (const question of comparisons) {
      const [bigUnit] = question.requiredUnits;
      const amounts = question.choices.map((choice) => amountsIn(choice.label)[0]);
      const winner = question.choices.find((choice) => choice.id === question.answerChoiceId);
      expect(Math.max(...amounts)).toBe(amountsIn(winner.label)[0]);
      const gap = Math.abs(amounts[0] - amounts[1]) / Math.max(...amounts);
      expect(gap).toBeLessThanOrEqual(0.06);
      // The winner's unit is the question unit whose label ends the winning
      // label exactly after its number ("710cm" is cm, not m).
      const winnerUnit = question.requiredUnits
        .map((id) => UNIT_DEFINITIONS.find((unit) => unit.id === id))
        .find((unit) => /^[0-9.]+$/u.test(winner.label.slice(0, -unit.label.length)) && winner.label.endsWith(unit.label));
      expect(winnerUnit).toBeDefined();
      if (winnerUnit.id !== bigUnit) smallerUnitWins += 1;
    }
    expect(smallerUnitWins / comparisons.length).toBeGreaterThanOrEqual(0.35);
    expect(smallerUnitWins / comparisons.length).toBeLessThanOrEqual(0.65);
  });

  it("くみあわせたんいの半分以上は、0がはさまる数かキリの悪い数を使う", () => {
    const tricky = [...of("compoundPart"), ...of("compoundToSingle")].filter((question) => {
      const numbers = question.prompt.match(/\d+/gu) ?? [];
      return numbers.some((number) => /0\d/u.test(number) || (number.length >= 2 && !/0$/u.test(number)));
    });
    expect(tricky.length / (of("compoundPart").length + of("compoundToSingle").length)).toBeGreaterThanOrEqual(0.5);
  });

  it("どの単位も、習う学年で3問以上ある（図鑑で集められる）", () => {
    const missing = UNIT_DEFINITIONS.filter((unit) => {
      const grade = Math.max(3, unit.introducedGrade);
      return pack.questions.filter((question) => question.grade <= grade && question.requiredUnits.includes(unit.id)).length < 3;
    }).map((unit) => unit.id);
    expect(missing).toEqual([]);
  });

  it("外した問題は退役一覧に残し、出題中の問題と重ならない", () => {
    const live = new Set(pack.questions.map((question) => question.id));
    for (const retired of pack.retiredQuestions) {
      expect(live.has(retired.id)).toBe(false);
      expect(retired.requiredUnits.length).toBeGreaterThan(0);
      expect(typeof retired.unitCategory).toBe("string");
    }
    expect(new Set(pack.retiredQuestions.map((question) => question.id)).size).toBe(pack.retiredQuestions.length);
  });

  it("くみあわせたんいは大きい単位と小さい単位の両方を問題文で示す", () => {
    for (const question of of("compoundPart")) {
      expect(question.prompt).toMatch(/は .+と何.+ですか。$/u);
      expect(amountsIn(question.prompt)).toHaveLength(2);
    }
  });
});
