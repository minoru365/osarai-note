import type { CharacterJson, CharDataLoaderFn } from "hanzi-writer";
import { generatedCharacterData as characterData } from "./generated/kanjiCharacterData";

export const supportedCharacters = Object.keys(characterData);

export const japaneseCharDataLoader: CharDataLoaderFn = (
  character,
  onComplete,
  onError,
) => {
  const data = characterData[character];

  if (!data) {
    onError?.(new Error(`日本語ストロークデータがありません: ${character}`));
    return;
  }

  onComplete(data);
};
