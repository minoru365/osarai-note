import { describe, expect, it } from "vitest";
import {
  formatExpectedAnswer,
  getUnitStateKey,
  isNumericAnswerCorrect,
  validateUnitPack,
  type NumericUnitQuestion,
} from "./unitContent";

const numeric = {
  id: "units:conversion:km:m:3",
  grade: 3,
  unitCategory: "length",
  questionType: "conversion",
  prompt: "3kmは 何mですか。",
  explanation: "1km = 1000m だから、3km は 3000m です。",
  requiredUnits: ["km", "m"],
  answerType: "numeric",
  answerUnit: "m",
  answerBaseValue: 3_000_000,
};

const choice = {
  id: "units:comparison:km:m:2",
  grade: 3,
  unitCategory: "length",
  questionType: "comparison",
  prompt: "2kmと 1900m、大きいのはどちらですか。",
  explanation: "2km は 2000m なので、2km のほうが大きいです。",
  requiredUnits: ["km", "m"],
  answerType: "choice",
  choices: [{ id: "left", label: "2km" }, { id: "right", label: "1900m" }],
  answerChoiceId: "left",
};

function pack(...questions: unknown[]) {
  return { schemaVersion: 1, questions };
}

describe("validateUnitPack", () => {
  it("数値回答と選択回答の問題を受け入れる", () => {
    expect(validateUnitPack(pack(numeric, choice))).toHaveLength(2);
  });

  it("問題IDの重複を拒否する", () => {
    expect(() => validateUnitPack(pack(numeric, numeric))).toThrow("重複");
  });

  it("その学年で未習の単位を使う問題を拒否する", () => {
    expect(() => validateUnitPack(pack({
      ...numeric,
      id: "units:conversion:m2:cm2:1",
      grade: 3,
      unitCategory: "area",
      requiredUnits: ["m2", "cm2"],
      answerUnit: "cm2",
    }))).toThrow("未習の単位");
  });

  it("系統と一致しない単位を拒否する", () => {
    expect(() => validateUnitPack(pack({
      ...numeric,
      requiredUnits: ["km", "kg"],
    }))).toThrow("系統と一致しません");
  });

  it("回答単位が使用単位に無い問題を拒否する", () => {
    expect(() => validateUnitPack(pack({ ...numeric, answerUnit: "cm" })))
      .toThrow("数値回答の指定が不正です");
  });

  it("整数でない答えを拒否する", () => {
    expect(() => validateUnitPack(pack({ ...numeric, answerBaseValue: 1.5 })))
      .toThrow("数値回答の指定が不正です");
  });

  it("その単位で小数表示できない答えを拒否する", () => {
    // 90秒は1.5分。60進の余りを小数桁として出すと「1.3分」になってしまう。
    expect(() => validateUnitPack(pack({
      ...numeric,
      id: "units:conversion:sec:min:1",
      unitCategory: "time",
      requiredUnits: ["sec", "min"],
      answerUnit: "min",
      answerBaseValue: 90,
    }))).toThrow("小数で表示できません");
  });

  it("正解のない選択肢を拒否する", () => {
    expect(() => validateUnitPack(pack({ ...choice, answerChoiceId: "middle" })))
      .toThrow("正解の選択肢がありません");
  });

  it("選択肢が1つや5つの問題を拒否する", () => {
    expect(() => validateUnitPack(pack({ ...choice, choices: [{ id: "left", label: "2km" }] })))
      .toThrow("選択肢の指定が不正です");
  });

  it("選択肢IDの重複を拒否する", () => {
    expect(() => validateUnitPack(pack({
      ...choice,
      choices: [{ id: "left", label: "2km" }, { id: "left", label: "1900m" }],
    }))).toThrow("選択肢の形式が不正です");
  });
});

describe("数値回答の判定", () => {
  const question = numeric as unknown as NumericUnitQuestion;

  it("正しい数値を受け入れる", () => {
    expect(isNumericAnswerCorrect(question, "3000")).toBe(true);
    expect(formatExpectedAnswer(question)).toBe("3000");
  });

  it("誤った数値と数値以外を拒否する", () => {
    ["3001", "300", "", "さん"].forEach((input) => {
      expect(isNumericAnswerCorrect(question, input)).toBe(false);
    });
  });

  it("小数の答えを誤差なく判定する", () => {
    const decimal = {
      ...numeric,
      unitCategory: "volume",
      requiredUnits: ["mL", "L"],
      answerUnit: "L",
      answerBaseValue: 8_200,
    } as unknown as NumericUnitQuestion;

    // 8.2 * 1000 は IEEE 754 では 8199.999... になる。
    expect(formatExpectedAnswer(decimal)).toBe("8.2");
    expect(isNumericAnswerCorrect(decimal, "8.2")).toBe(true);
    expect(isNumericAnswerCorrect(decimal, "8.3")).toBe(false);
  });
});

describe("getUnitStateKey", () => {
  it("系統と出題形式から集計キーを作る", () => {
    expect(getUnitStateKey(numeric as unknown as NumericUnitQuestion)).toBe("length:conversion");
  });
});
