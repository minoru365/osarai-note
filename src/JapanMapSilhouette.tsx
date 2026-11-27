import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { JapanMapPrefectureId } from "./japanMapContent";
import { fetchJapanMapSvg, readPrefectureOutlines } from "./japanMapSvgContent";

export function JapanMapSilhouette({ prefectureId }: { prefectureId: JapanMapPrefectureId }) {
  const [outlines, setOutlines] = useState<Map<string, string[]> | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewBox, setViewBox] = useState("");
  const outlineRef = useRef<SVGGElement>(null);
  const paths = outlines?.get(prefectureId);

  useEffect(() => {
    let active = true;
    void fetchJapanMapSvg().then((source) => {
      if (active) setOutlines(readPrefectureOutlines(source));
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, []);

  useLayoutEffect(() => {
    const bounds = outlineRef.current?.getBBox();
    if (!bounds) return;
    const { x, y, width, height } = bounds;
    const padding = Math.max(width, height) * 0.08;
    setViewBox(`${x - padding} ${y - padding} ${width + 2 * padding} ${height + 2 * padding}`);
  }, [paths]);

  if (failed || (outlines && !paths)) return <div className="japan-map-loading" role="alert">形を読み込めませんでした</div>;
  if (!paths) return <div className="japan-map-loading" role="status">形を読み込んでいます…</div>;

  return (
    <div className="japan-map-silhouette">
      <svg viewBox={viewBox || undefined} role="img" aria-label="都道府県の形">
        <g ref={outlineRef}>
          {paths.map((path) => <path key={path} d={path} />)}
        </g>
      </svg>
    </div>
  );
}
