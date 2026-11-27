import { JAPAN_MAP_PREFECTURE_IDS, type JapanMapPrefectureId } from "./japanMapContent";

const prefectureGroupPattern = /(<g\b[^>]*\binkscape:label=")([^"]+)("[^>]*>)/gu;
const sourceLabelAliases: Record<string, JapanMapPrefectureId> = {
  nigata: "niigata",
};

export async function fetchJapanMapSvg(): Promise<string> {
  const url = new URL(`${import.meta.env.BASE_URL}maps/japan-prefectures.svg`, document.baseURI);
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error("地図を読み込めませんでした");
  return response.text();
}

export function addPrefectureDataAttributes(svg: string): string {
  const prefectureIds = new Set<string>(JAPAN_MAP_PREFECTURE_IDS);
  return svg.replace(prefectureGroupPattern, (opening, prefix: string, sourceLabel: string, suffix: string) => {
    const prefectureId = sourceLabelAliases[sourceLabel] ?? sourceLabel;
    if (!prefectureIds.has(prefectureId)) return opening;

    const visibleSuffix = suffix.replace('style="display:none"', 'style="display:inline"');
    return `${prefix}${sourceLabel}${visibleSuffix.slice(0, -1)} data-prefecture-id="${prefectureId}">`;
  });
}

export function readPrefectureOutlines(svg: string): Map<string, string[]> {
  const map = new DOMParser().parseFromString(addPrefectureDataAttributes(svg), "image/svg+xml");
  const outlines = new Map<string, string[]>();
  // The labeled prefecture groups contain their main shapes. The source map
  // draws distant islands in separate groups, outside these outlines.
  for (const region of map.querySelectorAll("[data-prefecture-id]")) {
    const id = region.getAttribute("data-prefecture-id");
    const paths = [...region.querySelectorAll("path[d]")].map((path) => path.getAttribute("d") ?? "");
    if (id && paths.length > 0) outlines.set(id, paths);
  }
  return outlines;
}
