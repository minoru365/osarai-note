import type { CharacterJson } from "hanzi-writer";
import { describe, expect, it, vi } from "vitest";
import materials from "../content-source/kanji-materials.json";
import generated from "./generated/kanjiCharacterData.json";
import { createCharDataLoader, fetchCharacterData, parseCharacterData, type CharacterDataSet } from "./kanjiData";

const sample: CharacterJson = { strokes: ["M 0 0 L 1 1 Z"], medians: [[[0, 0], [1, 1]]] };

describe("Japanese kanji stroke data", () => {
  it("承認済み書き問題の対象漢字をすべて収録する", () => {
    const supported = Object.keys(parseCharacterData(generated));
    const required = new Set(materials.materials
      .filter((material) => material.reviewStatus === "approved")
      .flatMap((material) => material.targetKanji));
    expect(required.size).toBeGreaterThan(3);
    expect([...required].filter((character) => !supported.includes(character))).toEqual([]);
  });

  it("生成データにKanjiVGの出典とライセンスを含める", () => {
    expect(generated.license).toBe("CC BY-SA 3.0");
    expect(generated.source).toContain("KanjiVG");
  });

  it("形式が不正なデータを拒否する", () => {
    expect(() => parseCharacterData({})).toThrow();
    expect(() => parseCharacterData({ characters: {} })).toThrow();
    expect(() => parseCharacterData({ characters: { 暗: { strokes: ["M"], medians: [] } } })).toThrow();
  });
});

describe("createCharDataLoader", () => {
  const dataSet: CharacterDataSet = { 暗: sample };

  it("初回は読み込み完了後に、2回目以降は同期的に返す", async () => {
    const load = vi.fn(async () => dataSet);
    const { loader, preload } = createCharDataLoader(load);

    const first = vi.fn();
    loader("暗", first, vi.fn());
    expect(first).not.toHaveBeenCalled();
    await preload();
    expect(first).toHaveBeenCalledWith(sample);

    const second = vi.fn();
    loader("暗", second, vi.fn());
    expect(second).toHaveBeenCalledWith(sample);
    expect(load).toHaveBeenCalledOnce();
  });

  it("同時に頼まれても取得は1回にまとめる", async () => {
    const load = vi.fn(async () => dataSet);
    const { loader, preload } = createCharDataLoader(load);
    const onComplete = vi.fn();
    void preload();
    loader("暗", onComplete, vi.fn());
    loader("暗", onComplete, vi.fn());
    await preload();
    expect(load).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it("収録されていない字はエラーを返す", async () => {
    const { loader, preload } = createCharDataLoader(async () => dataSet);
    await preload();
    const onComplete = vi.fn();
    const onError = vi.fn();
    loader("無", onComplete, onError);
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    expect(String(onError.mock.calls[0][0])).toContain("無");
  });

  it("取得に失敗したら次の要求で取り直す", async () => {
    const load = vi.fn<() => Promise<CharacterDataSet>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(dataSet);
    const { loader, preload } = createCharDataLoader(load);

    const onError = vi.fn();
    loader("暗", vi.fn(), onError);
    await expect(preload()).rejects.toThrow("offline");
    expect(onError).toHaveBeenCalledOnce();

    const onComplete = vi.fn();
    loader("暗", onComplete, vi.fn());
    await preload();
    expect(onComplete).toHaveBeenCalledWith(sample);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("fetchCharacterData", () => {
  it("生成した静的ファイルを取得して検証する", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ characters: { 暗: sample } })));
    await expect(fetchCharacterData(fetcher as unknown as typeof fetch)).resolves.toEqual({ 暗: sample });
    expect(String(fetcher.mock.calls[0][0])).toContain("kanjiCharacterData");
  });

  it("取得に失敗したらエラーにする", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 404 }));
    await expect(fetchCharacterData(fetcher as unknown as typeof fetch)).rejects.toThrow("取得できません");
  });
});
