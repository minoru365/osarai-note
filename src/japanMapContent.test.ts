import { describe, expect, it } from "vitest";
import { JAPAN_MAP_PREFECTURE_IDS, validateJapanMapPack } from "./japanMapContent";

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
