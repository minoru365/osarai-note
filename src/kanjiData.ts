import type { CharacterJson, CharDataLoaderFn } from "hanzi-writer";
import leaf from "@jamsch/hanzi-writer-data-jp/葉.json";
import plant from "@jamsch/hanzi-writer-data-jp/植.json";
import thing from "@jamsch/hanzi-writer-data-jp/物.json";

const characterData: Record<string, CharacterJson> = {
  葉: leaf as CharacterJson,
  植: plant as CharacterJson,
  物: thing as CharacterJson,
};

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
