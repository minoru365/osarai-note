import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyReviewBatch, createCoverageMarkdown, createReviewBatch, createReviewBatchMarkdown, createReviewMarkdown, createWordCandidateMarkdown, generateKanjiPack, validateMaterialSource, validateMaterialsAgainstReference, validatePlaceNameReference, validateReadingReference, validateWordCandidates } from "./kanji-content-lib.mjs";

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
    expect(pack.questions[0]).toMatchObject({
      mode: "reading", word: "飲む", answerKanji: "飲",
      readingBefore: "", answerReading: "の", readingAfter: "む", prompt: "文の中の「飲」の読みを答えよう",
    });
    expect(pack.questions[1]).toMatchObject({
      mode: "writing", word: "飲む", answerKanji: "飲", promptBefore: "水を", promptAfter: "。",
      readingBefore: "", answerReading: "の", readingAfter: "む", prompt: "「の」の部分を漢字で書こう",
    });
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

  it("20件単位のレビュー票を作り、pendingでは素材と公開件数を変えない", () => {
    const input = source([
      material({ reviewStatus: "draft" }),
      material({ pairId: "g3-drink-on-in", readingType: "on", canonicalReading: "イン", reviewStatus: "draft" }),
    ]);
    const batch = createReviewBatch(input, { batchId: "g3-001", limit: 20 });
    const applied = applyReviewBatch(input, batch);
    expect(batch.entries).toHaveLength(2);
    expect(applied.counts).toEqual({ pending: 2, approved: 0, needsFix: 0 });
    expect(applied.source).toEqual(input);
    expect(generateKanjiPack(applied.source).questions).toHaveLength(0);
    expect(createReviewBatchMarkdown(batch)).toContain("対象：3年生 2件");
  });

  it("draftだけを承認・要修正へ変更し、古いレビュー票を拒否する", () => {
    const input = source([
      material({ reviewStatus: "draft" }),
      material({ pairId: "g3-drink-on-in", readingType: "on", canonicalReading: "イン", reviewStatus: "draft" }),
    ]);
    const batch = createReviewBatch(input, { batchId: "g3-001" });
    batch.entries[0].decision = "approve";
    batch.entries[0].proposed.promptBefore = "朝に水を";
    batch.entries[1].decision = "needs-fix";
    batch.entries[1].note = "例文を見直す";
    const applied = applyReviewBatch(input, batch);
    expect(applied.counts).toEqual({ pending: 0, approved: 1, needsFix: 1 });
    expect(applied.source.materials.map((entry) => entry.reviewStatus)).toEqual(["approved", "needs-fix"]);
    expect(generateKanjiPack(applied.source).questions).toHaveLength(2);

    const changed = structuredClone(input);
    changed.materials[0].promptBefore = "朝に水を";
    expect(() => applyReviewBatch(changed, batch)).toThrow("レビュー票作成後に素材が変更");
    expect(() => applyReviewBatch(applied.source, batch)).toThrow();
  });

  it("地名読みの素材からも読み・書きペアを生成する", () => {
    const pack = generateKanjiPack(source([material({
      pairId: "g4-osaka-name", grade: 4, primaryKanji: "阪", readingType: "name", canonicalReading: "さか",
      word: "大阪", wordReading: "おおさか", promptBefore: "", promptAfter: "府へ行きました。",
      targetKanji: ["大", "阪"], writingPrompt: "「おおさか」の漢字の部分を書こう",
    })]));
    expect(pack.questions).toHaveLength(2);
    expect(pack.questions[0]).toMatchObject({
      mode: "reading", word: "大阪", answerKanji: "大阪", answerReading: "おおさか", promptAfter: "府へ行きました。",
    });
    expect(pack.questions[1]).toMatchObject({ mode: "writing", prompt: "「おおさか」の部分を漢字で書こう" });
  });

  it("地名読みの基準読みは送り仮名の区切りを持たないひらがなに限る", () => {
    expect(() => validateMaterialSource(source([material({ readingType: "name", canonicalReading: "サカ" })])))
      .toThrow("基準読みが不正です");
    expect(() => validateMaterialSource(source([material({ readingType: "name", canonicalReading: "さ.か" })])))
      .toThrow("基準読みが不正です");
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
  const placeNames = JSON.parse(await readFile(resolve("content-source/place-name-readings.json"), "utf8"));
  const actualSource = JSON.parse(await readFile(resolve("content-source/kanji-materials.json"), "utf8"));
  const coverage = createCoverageMarkdown(actualSource, reference, placeNames);
  expect(coverage).toContain("基準読み：929");
  // 地名読みは音訓基準一覧の外にあるため、この件数には入らない。
  expect(coverage).toContain("素材作成済み：905");
  expect(coverage).toContain("未作成：24");
  expect(coverage).toContain("## 地名読み");
  expect(coverage).toContain("| draft | 4 | 滋 | し | 滋賀（しが） | 滋賀 |");
});

it("都道府県名でしか使わない読みを地名読み一覧から素材にする", async () => {
  const reference = JSON.parse(await readFile(resolve("content-source/joyo-readings-2010.json"), "utf8"));
  const placeNames = JSON.parse(await readFile(resolve("content-source/place-name-readings.json"), "utf8"));
  const actualSource = JSON.parse(await readFile(resolve("content-source/kanji-materials.json"), "utf8"));
  expect(validatePlaceNameReference(placeNames, reference)).toBe(placeNames);
  expect(placeNames.readings.map((entry) => entry.kanji).join("")).toBe("滋阪媛富");
  expect(validateMaterialsAgainstReference(actualSource, reference, placeNames)).toBe(actualSource);
  expect(() => validateMaterialsAgainstReference(actualSource, reference)).toThrow("地名読み一覧が渡されていません");
});

it("常用漢字表の音訓で読める読みは地名読みにしない", async () => {
  const reference = JSON.parse(await readFile(resolve("content-source/joyo-readings-2010.json"), "utf8"));
  const placeNames = JSON.parse(await readFile(resolve("content-source/place-name-readings.json"), "utf8"));
  const bypass = structuredClone(placeNames);
  bypass.readings.push({
    grade: 4, kanji: "香", canonicalReading: "か", placeName: "香川", placeNameReading: "かがわ",
    note: "訓「か」で読めるので地名読みにはしない",
  });
  expect(() => validatePlaceNameReference(bypass, reference)).toThrow("常用漢字表の音訓で読める読み");
});

it("地名読み一覧に無い生成キーの素材を拒否する", async () => {
  const reference = JSON.parse(await readFile(resolve("content-source/joyo-readings-2010.json"), "utf8"));
  const placeNames = JSON.parse(await readFile(resolve("content-source/place-name-readings.json"), "utf8"));
  const actualSource = JSON.parse(await readFile(resolve("content-source/kanji-materials.json"), "utf8"));
  const unlisted = structuredClone(actualSource);
  unlisted.materials.push({
    pairId: "kanji-g4-城-name-test", grade: 4, primaryKanji: "城", readingType: "name", canonicalReading: "き",
    word: "茨城", wordReading: "いばらき", promptBefore: "", promptAfter: "県へ行きました。",
    targetKanji: ["茨", "城"], writingPrompt: "「いばらき」の漢字の部分を書こう",
    sourceRef: "test", reviewStatus: "draft",
  });
  expect(() => validateMaterialsAgainstReference(unlisted, reference, placeNames)).toThrow("地名読み一覧にない生成キー");
});

it("文化庁語例から作った929件の未確認候補を検証する", async () => {
  const reference = JSON.parse(await readFile(resolve("content-source/joyo-readings-2010.json"), "utf8"));
  const candidates = JSON.parse(await readFile(resolve("content-source/kanji-word-candidates.json"), "utf8"));
  expect(validateWordCandidates(candidates, reference)).toBe(candidates);
  expect(candidates.counts.total).toBe(929);
  expect(candidates.counts.candidate).toBeGreaterThan(0);
  expect(createWordCandidateMarkdown(candidates, reference)).toContain("学年内表記で採用可能：868");
});
