export type KanaKind = "hiragana" | "katakana";

export const HIRAGANA_GRID = [
  "わ", "ら", "や", "ま", "は", "な", "た", "さ", "か", "あ",
  "を", "り", "ゆ", "み", "ひ", "に", "ち", "し", "き", "い",
  "ん", "る", "よ", "む", "ふ", "ぬ", "つ", "す", "く", "う",
  "・", "れ", "・", "め", "へ", "ね", "て", "せ", "け", "え",
  "・", "ろ", "・", "も", "ほ", "の", "と", "そ", "こ", "お",
] as const;

export const KATAKANA_GRID = [
  "ア", "カ", "サ", "タ", "ナ", "ハ", "マ", "ヤ", "ラ", "ワ",
  "イ", "キ", "シ", "チ", "ニ", "ヒ", "ミ", "ユ", "リ", "ヲ",
  "ウ", "ク", "ス", "ツ", "ヌ", "フ", "ム", "ヨ", "ル", "ン",
  "エ", "ケ", "セ", "テ", "ネ", "ヘ", "メ", "ー", "レ", "・",
  "オ", "コ", "ソ", "ト", "ノ", "ホ", "モ", "ヮ", "ロ", "・",
] as const;

const SMALL: Record<string, string> = {
  あ: "ぁ", い: "ぃ", う: "ぅ", え: "ぇ", お: "ぉ", や: "ゃ", ゆ: "ゅ", よ: "ょ", つ: "っ",
  ア: "ァ", イ: "ィ", ウ: "ゥ", エ: "ェ", オ: "ォ", ヤ: "ャ", ユ: "ュ", ヨ: "ョ", ツ: "ッ",
};

const NORMAL = Object.fromEntries(Object.entries(SMALL).map(([normal, small]) => [small, normal]));

const DAKUTEN: Record<string, string> = {
  か: "が", き: "ぎ", く: "ぐ", け: "げ", こ: "ご",
  さ: "ざ", し: "じ", す: "ず", せ: "ぜ", そ: "ぞ",
  た: "だ", ち: "ぢ", つ: "づ", て: "で", と: "ど",
  は: "ば", ひ: "び", ふ: "ぶ", へ: "べ", ほ: "ぼ",
  う: "ゔ",
  カ: "ガ", キ: "ギ", ク: "グ", ケ: "ゲ", コ: "ゴ",
  サ: "ザ", シ: "ジ", ス: "ズ", セ: "ゼ", ソ: "ゾ",
  タ: "ダ", チ: "ヂ", ツ: "ヅ", テ: "デ", ト: "ド",
  ハ: "バ", ヒ: "ビ", フ: "ブ", ヘ: "ベ", ホ: "ボ",
  ウ: "ヴ",
};

const HANDAKUTEN: Record<string, string> = {
  は: "ぱ", ひ: "ぴ", ふ: "ぷ", へ: "ぺ", ほ: "ぽ",
  ハ: "パ", ヒ: "ピ", フ: "プ", ヘ: "ペ", ホ: "ポ",
};

function replaceLast(answer: string, replacements: Record<string, string>): string {
  const characters = Array.from(answer);
  const last = characters.at(-1);
  if (!last || !replacements[last]) return answer;
  characters[characters.length - 1] = replacements[last];
  return characters.join("");
}

export function toggleSmallKana(answer: string): string {
  const last = Array.from(answer).at(-1);
  return replaceLast(answer, last && NORMAL[last] ? NORMAL : SMALL);
}

export function applyDakuten(answer: string): string {
  return replaceLast(answer, DAKUTEN);
}

export function applyHandakuten(answer: string): string {
  return replaceLast(answer, HANDAKUTEN);
}

export function deleteLastKana(answer: string): string {
  return Array.from(answer).slice(0, -1).join("");
}

export function normalizeReading(answer: string): string {
  return Array.from(answer).map((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : character;
  }).join("");
}

export function isCorrectReading(answer: string, expected: string): boolean {
  return normalizeReading(answer) === normalizeReading(expected);
}
