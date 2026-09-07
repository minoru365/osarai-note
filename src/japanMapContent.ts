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

export type JapanMapQuestion = {
  id: string;
  grade: 4;
  questionType: "prefecture-location";
  prefectureId: JapanMapPrefectureId;
  answer: string;
  prompt: string;
  explanation: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateJapanMapPack(value: unknown): JapanMapQuestion[] {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.questions)) {
    throw new Error("日本地図問題パックの形式が不正です");
  }

  const ids = new Set<string>();
  return value.questions.map((item) => {
    if (!isObject(item)
      || typeof item.id !== "string"
      || item.id.length === 0
      || ids.has(item.id)
      || item.grade !== 4
      || item.questionType !== "prefecture-location"
      || typeof item.prefectureId !== "string"
      || !(JAPAN_MAP_PREFECTURE_IDS as readonly string[]).includes(item.prefectureId)
      || typeof item.answer !== "string"
      || item.answer.length === 0
      || typeof item.prompt !== "string"
      || item.prompt.length === 0
      || typeof item.explanation !== "string"
      || item.explanation.length === 0) {
      throw new Error("日本地図問題の形式が不正です");
    }
    ids.add(item.id);
    return item as unknown as JapanMapQuestion;
  });
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
