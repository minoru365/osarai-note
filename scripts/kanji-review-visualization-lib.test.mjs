import { describe, expect, it } from "vitest";
import { createReviewVisualization } from "./kanji-review-visualization-lib.mjs";

const batch = {
  schemaVersion: 1,
  batchId: "kanji-g3-999",
  materialSourceVersion: "test",
  grade: 3,
  entries: [{
    pairId: "pair-1",
    primaryKanji: "飲",
    readingType: "kun",
    canonicalReading: "のむ",
    proposed: {
      word: "飲む",
      wordReading: "のむ",
      promptBefore: "水を",
      promptAfter: "。",
    },
    decision: "pending",
    note: "",
  }],
};

describe("漢字レビュー確認画面", () => {
  it("バッチJSONから例文・判定・送信処理を含むHTML断片を生成する", () => {
    const html = createReviewVisualization(batch);
    expect(html).toContain("水を");
    expect(html).toContain("飲む");
    expect(html).toContain("全部OK");
    expect(html).toContain("sendFollowUpMessage");
    expect(html).toContain("kanji-g3-999");
  });

  it("埋め込みデータでscript要素を閉じられない", () => {
    const hostile = structuredClone(batch);
    hostile.entries[0].proposed.promptAfter = "</script><script>alert(1)</script>";
    const html = createReviewVisualization(hostile);
    expect(html).not.toContain("</script><script>alert(1)</script>");
    expect(html).toContain("\\u003c/script\\u003e");
  });
});
