import { describe, expect, it } from "vitest";
import { countsTowardPrefectureCollection, JAPAN_MAP_PREFECTURE_IDS, japanMapAnswerKey, validateJapanMapPack } from "./japanMapContent";

const question = {
  id: "japan-map:prefecture:tokyo",
  grade: 4,
  questionType: "prefecture-location",
  prefectureId: "tokyo",
  answer: "東京都",
  prompt: "東京都は、地図のどこかな？",
  explanation: "東京都は、関東地方にあります。",
};

describe("日本地図問題パック", () => {
  it("47都道府県の識別子を持つ問題を受け入れる", () => {
    expect(JAPAN_MAP_PREFECTURE_IDS).toHaveLength(47);
    expect(validateJapanMapPack({ schemaVersion: 1, questions: [question] })).toEqual([question]);
  });

  it("未習年や未知の都道府県を拒否する", () => {
    expect(() => validateJapanMapPack({ schemaVersion: 1, questions: [{ ...question, grade: 3 }] })).toThrow("形式が不正");
    expect(() => validateJapanMapPack({ schemaVersion: 1, questions: [{ ...question, prefectureId: "unknown" }] })).toThrow("形式が不正");
  });
});

describe("県名・地方の問題の検査", () => {
  const base = { id: "japan-map:name:tokyo", grade: 4, questionType: "prefecture-name", prefectureId: "tokyo", answer: "東京都", prompt: "色のついた都道府県は、どこかな？", explanation: "東京都です。", choices: [{ id: "tokyo", label: "東京都" }, { id: "chiba", label: "千葉県" }], answerChoiceId: "tokyo" };
  const pack = (...questions: unknown[]) => ({ schemaVersion: 1, questions });

  it("選択肢つきの問題を受け入れ、答えのキーは選択肢のID", () => {
    const [question] = validateJapanMapPack(pack(base));
    expect(japanMapAnswerKey(question)).toBe("tokyo");
  });

  it("正解が選択肢に無い、選択肢が重なる問題を拒否する", () => {
    expect(() => validateJapanMapPack(pack({ ...base, answerChoiceId: "osaka" }))).toThrow();
    expect(() => validateJapanMapPack(pack({ ...base, choices: [{ id: "tokyo", label: "東京都" }, { id: "tokyo", label: "東京" }] }))).toThrow();
  });

  it("知らない種類の問題は止まらずに飛ばす（将来の問題で古い画面が壊れない）", () => {
    expect(validateJapanMapPack(pack(base, { ...base, id: "x", questionType: "future-type" }))).toHaveLength(1);
  });

  it("形の問題は都道府県名を選んで答え、場所を覚える図鑑の集計には入れない", () => {
    const [shape] = validateJapanMapPack(pack({ ...base, questionType: "prefecture-shape" }));
    expect(japanMapAnswerKey(shape)).toBe("tokyo");
    expect(countsTowardPrefectureCollection(shape)).toBe(false);
  });
});
