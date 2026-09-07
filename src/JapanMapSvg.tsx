import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { JAPAN_MAP_PREFECTURE_IDS, type JapanMapPrefectureId } from "./japanMapContent";
import { addPrefectureDataAttributes } from "./japanMapSvgContent";

type Props = {
  selectedId: JapanMapPrefectureId | null;
  correctId: JapanMapPrefectureId | null;
  onSelect: (id: JapanMapPrefectureId) => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

type PointerPosition = { x: number; y: number };

function distance(first: PointerPosition, second: PointerPosition): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function limitZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function limitPan(pan: PointerPosition, zoom: number, wrapper: HTMLDivElement | null): PointerPosition {
  if (!wrapper) return pan;
  const bounds = wrapper.getBoundingClientRect();
  const maxX = bounds.width * (zoom - 1) / 2;
  const maxY = bounds.height * (zoom - 1) / 2;
  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

export function JapanMapSvg({ selectedId, correctId, onSelect }: Props) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<PointerPosition>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, PointerPosition>());
  const pinchDistanceRef = useRef<number | null>(null);
  const dragPointerRef = useRef<number | null>(null);
  const draggedRef = useRef(false);
  const zoomRef = useRef(MIN_ZOOM);

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

  const updateZoom = (value: number) => {
    const nextZoom = limitZoom(value);
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    setPan((current) => limitPan(current, nextZoom, wrapperRef.current));
  };

  const resetView = () => {
    zoomRef.current = MIN_ZOOM;
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    if (pointersRef.current.size === 0) draggedRef.current = false;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      dragPointerRef.current = event.pointerId;
    } else if (pointersRef.current.size === 2) {
      dragPointerRef.current = null;
      setDragging(false);
      const [first, second] = [...pointersRef.current.values()];
      pinchDistanceRef.current = distance(first, second);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2 && pinchDistanceRef.current !== null) {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
      const [first, second] = [...pointersRef.current.values()];
      const nextDistance = distance(first, second);
      if (nextDistance > 0) {
        updateZoom(zoomRef.current * (nextDistance / pinchDistanceRef.current));
        pinchDistanceRef.current = nextDistance;
      }
      return;
    }

    if (pointersRef.current.size === 1 && dragPointerRef.current === event.pointerId) {
      const deltaX = event.clientX - previous.x;
      const deltaY = event.clientY - previous.y;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 2) {
        draggedRef.current = true;
        setDragging(true);
      }
      if (draggedRef.current && !event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
      setPan((current) => limitPan({ x: current.x + deltaX, y: current.y + deltaY }, zoomRef.current, wrapperRef.current));
    }
  };

  const releasePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pointersRef.current.size < 2) pinchDistanceRef.current = null;
    if (pointersRef.current.size === 1) {
      const [remainingId] = pointersRef.current.keys();
      dragPointerRef.current = remainingId;
      setDragging(true);
    } else if (pointersRef.current.size === 0) {
      dragPointerRef.current = null;
      setDragging(false);
    }
  };

  if (error) return <div className="japan-map-loading" role="alert">{error}</div>;
  if (!svg) return <div className="japan-map-loading" role="status">地図を読み込んでいます…</div>;

  return (
    <div
      ref={wrapperRef}
      className={`japan-map-svg${dragging ? " dragging" : ""}`}
      role="group"
      aria-label="都道府県の地図"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onClick={(event) => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        const target = event.target;
        if (!(target instanceof Element)) return;
        const region = target.closest("[data-prefecture-id]");
        const id = region?.getAttribute("data-prefecture-id");
        if ((JAPAN_MAP_PREFECTURE_IDS as readonly string[]).includes(id ?? "")) {
          onSelect(id as JapanMapPrefectureId);
        }
      }}
    >
      <div className="japan-map-canvas" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="japan-map-zoom-controls" aria-label="地図の拡大縮小">
        <button type="button" aria-label="地図を拡大" title="拡大" disabled={zoom >= MAX_ZOOM} onClick={() => updateZoom(zoomRef.current + ZOOM_STEP)}>＋</button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="地図を縮小" title="縮小" disabled={zoom <= MIN_ZOOM} onClick={() => updateZoom(zoomRef.current - ZOOM_STEP)}>−</button>
        <button className="reset" type="button" aria-label="地図の大きさをリセット" onClick={resetView}>リセット</button>
      </div>
    </div>
  );
}
