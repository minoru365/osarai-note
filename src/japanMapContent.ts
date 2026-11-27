import { validateManifest } from "./contentPack";

export const JAPAN_MAP_PREFECTURE_IDS = [
  "hokkaido", "aomori", "iwate", "miyagi", "akita", "yamagata", "fukushima",
  "ibaraki", "tochigi", "gunma", "saitama", "chiba", "tokyo", "kanagawa",
  "niigata", "toyama", "ishikawa", "fukui", "yamanashi", "nagano", "gifu",
  "shizuoka", "aichi", "mie", "shiga", "kyoto", "osaka", "hyogo", "nara",
  "wakayama", "tottori", "shimane", "okayama", "hiroshima", "yamaguchi",
  "tokushima", "kagawa", "ehime", "kochi", "fukuoka", "saga", "nagasaki",
  "kumamoto", "oita", "miyazaki", "kagoshima", "okinawa",
] as const;

export type JapanMapPrefectureId = typeof JAPAN_MAP_PREFECTURE_IDS[number];

export const JAPAN_MAP_QUESTION_TYPES = ["prefecture-location", "prefecture-name", "prefecture-region", "prefecture-shape"] as const;
export type JapanMapQuestionType = typeof JAPAN_MAP_QUESTION_TYPES[number];

export type JapanMapChoice = { id: string; label: string };

/**
 * prefecture-location: tap the prefecture on the map.
 * prefecture-name: the prefecture is coloured on the map; pick its name.
 * prefecture-region: pick the region the named (and coloured) prefecture is in.
 * prefecture-shape: pick the name from its outline alone.
 */
export type JapanMapQuestion = {
  id: string;
  grade: 4;
  questionType: JapanMapQuestionType;
  prefectureId: JapanMapPrefectureId;
  answer: string;
  prompt: string;
  explanation: string;
  choices?: JapanMapChoice[];
  answerChoiceId?: string;
};

/** The value a correct answer submits: a prefecture for the map, a choice id otherwise. */
export function japanMapAnswerKey(question: JapanMapQuestion): string {
  return question.questionType === "prefecture-location" ? question.prefectureId : question.answerChoiceId ?? "";
}

/** Questions that show where the prefecture is, and so count for the 都道府県図鑑 (ADR-0015). */
export function countsTowardPrefectureCollection(question: Pick<JapanMapQuestion, "questionType">): boolean {
  return question.questionType === "prefecture-location" || question.questionType === "prefecture-name";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validChoices(item: Record<string, unknown>): boolean {
  if (!Array.isArray(item.choices) || item.choices.length < 2 || item.choices.length > 8 || typeof item.answerChoiceId !== "string") return false;
  const ids = new Set<string>();
  for (const choice of item.choices) {
    if (!isObject(choice) || typeof choice.id !== "string" || choice.id.length === 0
      || typeof choice.label !== "string" || choice.label.length === 0 || ids.has(choice.id)) return false;
    ids.add(choice.id);
  }
  return ids.has(item.answerChoiceId);
}

export function validateJapanMapPack(value: unknown): JapanMapQuestion[] {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.questions)) {
    throw new Error("日本地図問題パックの形式が不正です");
  }

  const ids = new Set<string>();
  const questions: JapanMapQuestion[] = [];
  for (const item of value.questions) {
    // A question type this version does not know is skipped, not fatal, so a
    // future pack never breaks a tab left open on an older version.
    if (isObject(item) && typeof item.questionType === "string"
      && !(JAPAN_MAP_QUESTION_TYPES as readonly string[]).includes(item.questionType)) continue;
    if (!isObject(item)
      || typeof item.id !== "string"
      || item.id.length === 0
      || ids.has(item.id)
      || item.grade !== 4
      || typeof item.prefectureId !== "string"
      || !(JAPAN_MAP_PREFECTURE_IDS as readonly string[]).includes(item.prefectureId)
      || typeof item.answer !== "string"
      || item.answer.length === 0
      || typeof item.prompt !== "string"
      || item.prompt.length === 0
      || typeof item.explanation !== "string"
      || item.explanation.length === 0
      || (item.questionType !== "prefecture-location" && !validChoices(item))) {
      throw new Error("日本地図問題の形式が不正です");
    }
    ids.add(item.id);
    questions.push(item as unknown as JapanMapQuestion);
  }
  return questions;
}

export async function loadJapanMapQuestions(fetcher: typeof fetch = fetch): Promise<JapanMapQuestion[]> {
  const contentRoot = new URL(`${import.meta.env.BASE_URL}content/`, document.baseURI);
  const manifestResponse = await fetcher(new URL("manifest.json", contentRoot), { cache: "no-cache" });
  if (!manifestResponse.ok) throw new Error("問題パック一覧を取得できませんでした");
  const manifest = validateManifest(await manifestResponse.json());
  const mapPack = manifest.packs.find((pack) => pack.subject === "japan-map");
  if (!mapPack) return [];

  const packResponse = await fetcher(new URL(mapPack.url, contentRoot), { cache: "no-cache" });
  if (!packResponse.ok) throw new Error("日本地図問題パックを取得できませんでした");
  return validateJapanMapPack(await packResponse.json());
}
