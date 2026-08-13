import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCoverageMarkdown, createReviewMarkdown, generateKanjiPack, validateMaterialSource, validateReadingReference } from "./kanji-content-lib.mjs";

const material = (overrides = {}) => ({
  pairId: "g3-drink-kun-nomu",
  grade: 3,
  primaryKanji: "飲",
  readingType: "kun",
  canonicalReading: "の.む",
  word: "飲む",
  wordReading: "のむ",
  promptBefore: "水を",
  promptAfter: "。",
  targetKanji: ["飲"],
  writingPrompt: "「のむ」の「の」を漢字で書こう",
  sourceRef: "文化庁 常用漢字表（平成22年内閣告示）",
  reviewStatus: "approved",
  ...overrides,
});
const source = (materials) => ({ schemaVersion: 1, sourceVersion: "test-1", materials });

describe("kanji content generator", () => {
  it("送り仮名を含む共通素材から読み・書きペアを生成する", () => {
    const pack = generateKanjiPack(source([material()]));
    expect(pack.schemaVersion).toBe(2);
    expect(pack.questions).toHaveLength(2);
    expect(pack.questions[0]).toMatchObject({ mode: "reading", word: "飲む", answerKanji: "飲" });
    expect(pack.questions[1]).toMatchObject({ mode: "writing", word: "飲む", answerKanji: "飲" });
  });

  it("既存の学習履歴と当日セットのため固定問題IDを維持する", () => {
    const pack = generateKanjiPack(source([material({
      questionIds: { reading: "legacy-reading", writing: "legacy-writing" },
    })]));
    expect(pack.questions.map((question) => question.id)).toEqual(["legacy-reading", "legacy-writing"]);
  });

  it("未確認と要修正をレビュー一覧へ残し、公開パックから除外する", () => {
    const input = source([
      material(),
      material({ pairId: "g3-drink-on-in", readingType: "on", canonicalReading: "イン", reviewStatus: "draft" }),
    ]);
    expect(generateKanjiPack(input).questions).toHaveLength(2);
    expect(createReviewMarkdown(input)).toContain("未確認：1");
  });

  it("重複生成キー、学年超過漢字、ひらがな以外の回答を拒否する", () => {
    expect(() => validateMaterialSource(source([material(), material({ pairId: "duplicate" })]))).toThrow("生成キーが重複");
    expect(() => validateMaterialSource(source([material({ promptBefore: "議会で" })]))).toThrow("学年配当外");
    expect(() => validateMaterialSource(source([material({ wordReading: "ノム" })]))).toThrow("ひらがな");
  });
});

it("3年生200字・4年生202字の版付き音訓基準一覧を検証する", async () => {
  const reference = JSON.parse(await readFile(resolve("content-source/joyo-readings-2010.json"), "utf8"));
  expect(validateReadingReference(reference)).toBe(reference);
  expect(reference.grades["3"]).toHaveLength(200);
  expect(reference.grades["4"]).toHaveLength(202);
});

it("全基準読みに対する素材作成・確認状況を出力する", async () => {
  const reference = JSON.parse(await readFile(resolve("content-source/joyo-readings-2010.json"), "utf8"));
  const actualSource = JSON.parse(await readFile(resolve("content-source/kanji-materials.json"), "utf8"));
  const coverage = createCoverageMarkdown(actualSource, reference);
  expect(coverage).toContain("基準読み：929");
  expect(coverage).toContain("素材作成済み：2");
  expect(coverage).toContain("未作成：927");
});
