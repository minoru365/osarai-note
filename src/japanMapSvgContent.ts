import { JAPAN_MAP_PREFECTURE_IDS, type JapanMapPrefectureId } from "./japanMapContent";

const prefectureGroupPattern = /(<g\b[^>]*\binkscape:label=")([^"]+)("[^>]*>)/gu;
const sourceLabelAliases: Record<string, JapanMapPrefectureId> = {
  nigata: "niigata",
};

export function addPrefectureDataAttributes(svg: string): string {
  const prefectureIds = new Set<string>(JAPAN_MAP_PREFECTURE_IDS);
  return svg.replace(prefectureGroupPattern, (opening, prefix: string, sourceLabel: string, suffix: string) => {
    const prefectureId = sourceLabelAliases[sourceLabel] ?? sourceLabel;
    if (!prefectureIds.has(prefectureId)) return opening;

    const visibleSuffix = suffix.replace('style="display:none"', 'style="display:inline"');
    return `${prefix}${sourceLabel}${visibleSuffix.slice(0, -1)} data-prefecture-id="${prefectureId}">`;
  });
}
