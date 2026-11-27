// Checks the generated japan map pack. Reads files with node:fs, so it lives
// with the generator rather than under src (see unit-content-pack.test.mjs).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pack = JSON.parse(readFileSync(join(ROOT, "public/content/japan-map-v1.json"), "utf8"));
const source = JSON.parse(readFileSync(join(ROOT, "content-source/japan-map-questions.json"), "utf8"));
const regions = JSON.parse(readFileSync(join(ROOT, "content-source/japan-map-regions.json"), "utf8")).regions;
const of = (type) => pack.questions.filter((question) => question.questionType === type);

describe("日本地図の問題パック", () => {
  it("場所の47問は素材のまま（IDも中身も変えない）", () => {
    expect(of("prefecture-location")).toEqual(source.questions);
  });

  it("選択肢が重ならず正解がちょうど1つ", () => {
    for (const question of pack.questions.filter((question) => question.questionType !== "prefecture-location")) {
      const ids = question.choices.map((choice) => choice.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.filter((id) => id === question.answerChoiceId)).toHaveLength(1);
      expect(question.choices.find((choice) => choice.id === question.answerChoiceId).label).toBe(question.answer);
    }
  });

  it("形の問題は47都道府県を1問ずつ出し、正解IDはその都道府県", () => {
    const shapes = of("prefecture-shape");
    expect(shapes.map((question) => question.prefectureId)).toEqual(source.questions.map((question) => question.prefectureId));
    for (const question of shapes) {
      expect(question.choices).toHaveLength(4);
      expect(question.answerChoiceId).toBe(question.prefectureId);
      expect(question.prompt).not.toContain(question.answer);
    }
  });

  it("地方の答えは地方の表どおりで、沖縄県は九州地方", () => {
    const regionOf = new Map(regions.flatMap((region) => region.prefectures.map((id) => [id, region.id])));
    for (const question of of("prefecture-region")) {
      expect(question.answerChoiceId).toBe(regionOf.get(question.prefectureId));
    }
    expect(of("prefecture-region").find((question) => question.prefectureId === "okinawa").answerChoiceId).toBe("kyushu");
    expect(of("prefecture-region").some((question) => question.prefectureId === "hokkaido")).toBe(false);
  });

  it("説明の地方名が地方の表と食い違わない", () => {
    const labelOf = new Map(regions.flatMap((region) => region.prefectures.map((id) => [id, region.label])));
    for (const question of pack.questions) {
      expect(question.explanation).toContain(`${labelOf.get(question.prefectureId)}地方`);
    }
  });
});
