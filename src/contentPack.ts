type KanjiQuestionBase = {
  id: string;
  grade: 3 | 4;
  word: string;
  reading: string;
  prompt: string;
  targetKanji: string[];
  answerKanji: string;
};

export type KanjiWritingQuestion = KanjiQuestionBase & {
  mode: "writing";
};

export type KanjiReadingQuestion = KanjiQuestionBase & {
  mode: "reading";
  promptBefore: string;
  promptAfter: string;
};

export type KanjiQuestion = KanjiWritingQuestion | KanjiReadingQuestion;

type ContentManifest = {
  schemaVersion: 1;
  contentVersion: string;
  packs: Array<{ subject: "kanji"; url: string }>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateManifest(value: unknown): ContentManifest {
  if (!isObject(value) || value.schemaVersion !== 1 || typeof value.contentVersion !== "string" || !Array.isArray(value.packs)) {
    throw new Error("問題パック一覧の形式が不正です");
  }
  const packs = value.packs.map((pack) => {
    if (!isObject(pack) || pack.subject !== "kanji" || typeof pack.url !== "string" || !pack.url.endsWith(".json") || pack.url.includes("..") || pack.url.startsWith("/")) {
      throw new Error("問題パックの参照先が不正です");
    }
    return { subject: "kanji" as const, url: pack.url };
  });
  return { schemaVersion: 1, contentVersion: value.contentVersion, packs };
}

export function validateKanjiPack(value: unknown): KanjiQuestion[] {
  if (!isObject(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2) || !Array.isArray(value.questions)) {
    throw new Error("漢字問題パックの形式が不正です");
  }

  const ids = new Set<string>();
  return value.questions.map((question) => {
    if (!isObject(question)
      || typeof question.id !== "string"
      || (question.grade !== 3 && question.grade !== 4)
      || (question.mode !== "writing" && question.mode !== "reading")
      || typeof question.word !== "string"
      || typeof question.reading !== "string"
      || typeof question.prompt !== "string"
      || !Array.isArray(question.targetKanji)
      || !question.targetKanji.every((character) => typeof character === "string" && Array.from(character).length === 1)) {
      throw new Error("漢字問題の形式が不正です");
    }
    const answerKanji = typeof question.answerKanji === "string"
      ? question.answerKanji
      : question.targetKanji.join("");
    const word = question.word as string;
    if (answerKanji !== question.targetKanji.join("")
      || !question.targetKanji.every((character) => word.includes(character))) {
      throw new Error("漢字問題の回答文字が不正です");
    }
    if (question.mode === "reading"
      && (typeof question.promptBefore !== "string" || typeof question.promptAfter !== "string")) {
      throw new Error("読み問題の文脈が不正です");
    }
    if (ids.has(question.id)) throw new Error(`問題IDが重複しています: ${question.id}`);
    ids.add(question.id);
    return { ...question, answerKanji } as KanjiQuestion;
  });
}

export async function loadKanjiQuestions(fetcher: typeof fetch = fetch): Promise<KanjiQuestion[]> {
  const contentRoot = new URL(`${import.meta.env.BASE_URL}content/`, document.baseURI);
  const manifestResponse = await fetcher(new URL("manifest.json", contentRoot), { cache: "no-cache" });
  if (!manifestResponse.ok) throw new Error("問題パック一覧を取得できませんでした");
  const manifest = validateManifest(await manifestResponse.json());
  const kanjiPack = manifest.packs.find((pack) => pack.subject === "kanji");
  if (!kanjiPack) throw new Error("漢字問題パックがありません");

  const packResponse = await fetcher(new URL(kanjiPack.url, contentRoot), { cache: "no-cache" });
  if (!packResponse.ok) throw new Error("漢字問題パックを取得できませんでした");
  return validateKanjiPack(await packResponse.json());
}
