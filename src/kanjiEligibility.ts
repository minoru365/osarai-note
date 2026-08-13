import type { KanjiCatalogEntry } from "./kanjiCatalog";
import type { KanjiState } from "./storage/schema";

export function isKanjiEligible(
  entry: KanjiCatalogEntry,
  state: KanjiState | undefined,
): boolean {
  return state?.learned ?? true;
}

export function filterEligibleKanji(
  entries: KanjiCatalogEntry[],
  states: ReadonlyMap<string, KanjiState>,
): KanjiCatalogEntry[] {
  return entries.filter((entry) => isKanjiEligible(entry, states.get(entry.character)));
}
