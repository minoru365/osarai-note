import type { CharacterJson, CharDataLoaderFn } from "hanzi-writer";
// `?url` makes Vite emit the stroke data as a hashed static asset instead of
// bundling 2MB+ of JSON into the main chunk. The hash ties the data to the
// JavaScript build, so a cached app never pairs new code with old strokes.
import characterDataUrl from "./generated/kanjiCharacterData.json?url";

export type CharacterDataSet = Record<string, CharacterJson>;

function isCharacterJson(value: unknown): value is CharacterJson {
  if (typeof value !== "object" || value === null) return false;
  const { strokes, medians } = value as Record<string, unknown>;
  return Array.isArray(strokes) && Array.isArray(medians) && strokes.length > 0 && strokes.length === medians.length;
}

export function parseCharacterData(value: unknown): CharacterDataSet {
  const characters = typeof value === "object" && value !== null
    ? (value as Record<string, unknown>).characters
    : undefined;
  if (typeof characters !== "object" || characters === null || Array.isArray(characters)) {
    throw new Error("日本語ストロークデータの形式が不正です");
  }
  const entries = Object.entries(characters);
  if (entries.length === 0 || !entries.every(([, data]) => isCharacterJson(data))) {
    throw new Error("日本語ストロークデータの形式が不正です");
  }
  return characters as CharacterDataSet;
}

export async function fetchCharacterData(fetcher: typeof fetch = fetch): Promise<CharacterDataSet> {
  const response = await fetcher(characterDataUrl);
  if (!response.ok) throw new Error("日本語ストロークデータを取得できませんでした");
  return parseCharacterData(await response.json());
}

/**
 * Builds a Hanzi Writer loader around one shared download. Once the data is in
 * memory the loader answers synchronously, so only the very first character
 * waits. A failed download is forgotten so the next character can retry, for
 * example after the tablet comes back online.
 */
export function createCharDataLoader(load: () => Promise<CharacterDataSet>) {
  let data: CharacterDataSet | undefined;
  let pending: Promise<CharacterDataSet> | undefined;

  const ensureLoaded = (): Promise<CharacterDataSet> => {
    if (data) return Promise.resolve(data);
    pending ??= load().then(
      (loaded) => {
        data = loaded;
        return loaded;
      },
      (error: unknown) => {
        pending = undefined;
        throw error;
      },
    );
    return pending;
  };

  const answer = (set: CharacterDataSet, character: string, onComplete: (data: CharacterJson) => void, onError?: (error?: unknown) => void) => {
    const characterData = set[character];
    if (!characterData) {
      onError?.(new Error(`日本語ストロークデータがありません: ${character}`));
      return;
    }
    onComplete(characterData);
  };

  const loader: CharDataLoaderFn = (character, onComplete, onError) => {
    if (data) {
      answer(data, character, onComplete, onError);
      return;
    }
    ensureLoaded().then(
      (loaded) => answer(loaded, character, onComplete, onError),
      (error: unknown) => onError?.(error),
    );
  };

  return { loader, preload: () => ensureLoaded().then(() => undefined) };
}

const japaneseCharData = createCharDataLoader(() => fetchCharacterData());

export const japaneseCharDataLoader = japaneseCharData.loader;

/**
 * Starts the download in the background. Run at startup so the asset reaches
 * the service worker cache while the tablet is online, even if the writing
 * screen is first opened offline.
 */
export const preloadJapaneseCharData = japaneseCharData.preload;
