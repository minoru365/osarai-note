import { describe, expect, it } from "vitest";
import { findPairedQuestion, getKanjiAnswerParts, getWritingReadingParts, validateKanjiPack, validateManifest } from "./contentPack";

describe("content pack validation", () => {
  it("バージョン付き問題パック一覧を受け入れる", () => {
    expect(validateManifest({
      schemaVersion: 1,
      contentVersion: "2026.08.13-1",
      packs: [{ subject: "kanji", url: "kanji-v1.json" }],
    }).packs).toHaveLength(1);
  });

  it("外部・親ディレクトリの問題パック参照を拒否する", () => {
    expect(() => validateManifest({
      schemaVersion: 1,
      contentVersion: "bad",
      packs: [{ subject: "kanji", url: "../private.json" }],
    })).toThrow("参照先が不正");
  });

  it("正しい漢字問題を受け入れる", () => {
    expect(validateKanjiPack({
      schemaVersion: 1,
      packId: "test",
      questions: [{
        id: "q1", grade: 3, mode: "writing", word: "植物", reading: "しょくぶつ",
        prompt: "書こう", targetKanji: ["植", "物"],
      }],
    })).toHaveLength(1);
  });

  it("新形式では送り仮名を表示し、漢字だけを回答にできる", () => {
    expect(validateKanjiPack({
      schemaVersion: 2,
      questions: [{
        id: "r-drink", grade: 3, mode: "reading", word: "飲む", reading: "のむ",
        prompt: "読みましょう", promptBefore: "水を", promptAfter: "。", targetKanji: ["飲"], answerKanji: "飲",
      }],
    })[0]).toMatchObject({ word: "飲む", answerKanji: "飲" });
  });

  it("新形式の書き問題には答えを隠した例文を必須にする", () => {
    const writing = {
      id: "w-dark", grade: 3, mode: "writing", word: "暗い", reading: "くらい",
      prompt: "漢字の部分を書こう", promptBefore: "外が", promptAfter: "ので、電気をつけます。",
      readingBefore: "", answerReading: "くら", readingAfter: "い",
      targetKanji: ["暗"], answerKanji: "暗",
    };
    expect(validateKanjiPack({ schemaVersion: 2, questions: [writing] })[0]).toMatchObject({
      promptBefore: "外が", promptAfter: "ので、電気をつけます。",
    });
    const { promptBefore: _before, ...withoutContext } = writing;
    expect(() => validateKanjiPack({ schemaVersion: 2, questions: [withoutContext] })).toThrow("書き問題の文脈");
  });

  it("更新前の問題が画面に残っていても漢字部分の読みを復元する", () => {
    expect(getWritingReadingParts({
      word: "暗い", reading: "くらい", answerKanji: "暗", answerReading: "",
    })).toEqual({ readingBefore: "", answerReading: "くら", readingAfter: "い" });
    expect(getWritingReadingParts({
      word: "飲む", reading: "のむ", answerKanji: "飲",
    })).toEqual({ readingBefore: "", answerReading: "の", readingAfter: "む" });
  });

  it("読み問題でも漢字部分と送り仮名を分ける", () => {
    expect(getKanjiAnswerParts({
      word: "暗い", reading: "くらい", answerKanji: "暗",
    })).toEqual({
      wordBefore: "", answerKanji: "暗", wordAfter: "い",
      readingBefore: "", answerReading: "くら", readingAfter: "い",
    });
    expect(getKanjiAnswerParts({
      word: "お祝い", reading: "おいわい", answerKanji: "祝",
    })).toEqual({
      wordBefore: "お", answerKanji: "祝", wordAfter: "い",
      readingBefore: "お", answerReading: "いわ", readingAfter: "い",
    });
  });

  it("自由練習のタブ切替で同じ問題ペアを選ぶ", () => {
    const pair = validateKanjiPack({ schemaVersion: 2, questions: [{
      id: "dark:reading", pairId: "dark", grade: 3, mode: "reading", word: "暗い", reading: "くらい",
      prompt: "読む", promptBefore: "外が", promptAfter: "。", targetKanji: ["暗"], answerKanji: "暗",
    }, {
      id: "dark:writing", pairId: "dark", grade: 3, mode: "writing", word: "暗い", reading: "くらい",
      prompt: "書く", promptBefore: "外が", promptAfter: "。", readingBefore: "", answerReading: "くら", readingAfter: "い",
      targetKanji: ["暗"], answerKanji: "暗",
    } ] });
    expect(findPairedQuestion(pair, pair[0], "writing")?.id).toBe("dark:writing");
  });

  it("文脈を持つ読み問題を受け入れる", () => {
    expect(validateKanjiPack({
      schemaVersion: 1,
      questions: [{
        id: "r1", grade: 3, mode: "reading", word: "葉", reading: "は",
        prompt: "葉を読みましょう", promptBefore: "木の", promptAfter: "をひろいました。", targetKanji: ["葉"],
      }],
    })).toHaveLength(1);
  });

  it("重複IDと答えに一致しない対象漢字を拒否する", () => {
    const question = {
      id: "q1", grade: 3, mode: "writing", word: "植物", reading: "しょくぶつ",
      prompt: "書こう", targetKanji: ["植"],
    };
    expect(() => validateKanjiPack({ schemaVersion: 2, questions: [{ ...question, answerKanji: "物" }] })).toThrow("回答文字が不正");
    expect(() => validateKanjiPack({
      schemaVersion: 1,
      questions: [{ ...question, targetKanji: ["植", "物"] }, { ...question, targetKanji: ["植", "物"] }],
    })).toThrow("問題IDが重複");
  });
});
