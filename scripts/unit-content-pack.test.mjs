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

  it("くみあわせたんいは大きい単位と小さい単位の両方を問題文で示す", () => {
    for (const question of of("compoundPart")) {
      expect(question.prompt).toMatch(/は .+と何.+ですか。$/u);
      expect(amountsIn(question.prompt)).toHaveLength(2);
    }
  });
});
