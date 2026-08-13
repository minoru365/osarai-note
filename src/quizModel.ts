export type CharacterResult = {
  character: string;
  mistakes: number;
  usedGuide: boolean;
};

export type WordProgress = {
  characters: string[];
  currentIndex: number;
  results: CharacterResult[];
};

export function createWordProgress(word: string): WordProgress {
  return {
    characters: Array.from(word),
    currentIndex: 0,
    results: [],
  };
}

export function completeCurrentCharacter(
  progress: WordProgress,
  result: CharacterResult,
): WordProgress {
  if (progress.currentIndex >= progress.characters.length) return progress;

  const expected = progress.characters[progress.currentIndex];
  if (result.character !== expected) {
    throw new Error(`完了文字が一致しません: expected=${expected}, actual=${result.character}`);
  }

  return {
    ...progress,
    currentIndex: progress.currentIndex + 1,
    results: [...progress.results, result],
  };
}

export function isWordComplete(progress: WordProgress): boolean {
  return progress.currentIndex >= progress.characters.length;
}
