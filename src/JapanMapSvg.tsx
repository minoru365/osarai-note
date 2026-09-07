import { useEffect, useRef, useState } from "react";
import { JAPAN_MAP_PREFECTURE_IDS, type JapanMapPrefectureId } from "./japanMapContent";

type Props = {
  selectedId: JapanMapPrefectureId | null;
  correctId: JapanMapPrefectureId | null;
  onSelect: (id: JapanMapPrefectureId) => void;
};

const labelPattern = new RegExp(
  `(inkscape:label=")((${JAPAN_MAP_PREFECTURE_IDS.join("|")}))(\")`,
  "gu",
);

function addPrefectureDataAttributes(svg: string): string {
  return svg.replace(labelPattern, '$1$2$4 data-prefecture-id="$3"');
}

export function JapanMapSvg({ selectedId, correctId, onSelect }: Props) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    const url = new URL(`${import.meta.env.BASE_URL}maps/japan-prefectures.svg`, document.baseURI);
    void fetch(url, { cache: "force-cache" }).then(async (response) => {
      if (!response.ok) throw new Error("地図を読み込めませんでした");
      return response.text();
    }).then((contents) => {
      if (active) setSvg(addPrefectureDataAttributes(contents));
    }).catch(() => {
      if (active) setError("地図を読み込めませんでした");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    wrapper.querySelectorAll<SVGGElement>("[data-prefecture-id]").forEach((region) => {
      const id = region.dataset.prefectureId;
      region.dataset.selected = id === selectedId ? "true" : "false";
      region.dataset.correct = id === correctId ? "true" : "false";
    });
  }, [correctId, selectedId, svg]);

  if (error) return <div className="japan-map-loading" role="alert">{error}</div>;
  if (!svg) return <div className="japan-map-loading" role="status">地図を読み込んでいます…</div>;

  return (
    <div
      ref={wrapperRef}
      className="japan-map-svg"
      role="group"
      aria-label="都道府県の地図"
      onClick={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const region = target.closest("[data-prefecture-id]");
        const id = region?.getAttribute("data-prefecture-id");
        if ((JAPAN_MAP_PREFECTURE_IDS as readonly string[]).includes(id ?? "")) {
          onSelect(id as JapanMapPrefectureId);
        }
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
