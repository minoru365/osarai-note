// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { JapanMapSvg } from "./JapanMapSvg";
import { JAPAN_MAP_PREFECTURE_IDS } from "./japanMapContent";
import { addPrefectureDataAttributes, readPrefectureOutlines } from "./japanMapSvgContent";

const sourceSvg = readFileSync(resolve(process.cwd(), "public/maps/japan-prefectures.svg"), "utf8");

describe("日本地図SVGのクリック領域", () => {
  it("47都道府県すべてにクリック用の識別子を付ける", () => {
    const svg = addPrefectureDataAttributes(sourceSvg);
    const ids = [...svg.matchAll(/data-prefecture-id="([^"]+)"/gu)].map((match) => match[1]);

    expect(ids).toHaveLength(47);
    expect(new Set(ids).size).toBe(47);
    expect(ids).toContain("niigata");
  });

  it("香川県の非表示指定と新潟県の綴り違いを吸収する", () => {
    const svg = addPrefectureDataAttributes(sourceSvg);
    const kagawa = svg.match(/<g[^>]*inkscape:label="kagawa"[^>]*>/u)?.[0];
    const niigata = svg.match(/<g[^>]*inkscape:label="nigata"[^>]*>/u)?.[0];

    expect(kagawa).toContain('style="display:inline"');
    expect(kagawa).toContain('data-prefecture-id="kagawa"');
    expect(niigata).toContain('data-prefecture-id="niigata"');
  });

  it("離島の別レイヤーを除き、全47都道府県に輪郭がある", () => {
    const outlines = readPrefectureOutlines(sourceSvg);

    expect([...outlines.keys()].sort()).toEqual([...JAPAN_MAP_PREFECTURE_IDS].sort());
    for (const paths of outlines.values()) {
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.every((path) => /^[Mm]\s?[-\d]/u.test(path))).toBe(true);
    }
    expect(outlines.get("tokyo")).toHaveLength(1);
    expect(outlines.get("nagasaki")).toHaveLength(2);
    expect(outlines.get("kagoshima")).toHaveLength(1);
    expect(outlines.get("okinawa")).toHaveLength(1);
  });
});

it("拡大とリセットで県の色が消えず、次の問題の県に切り替わる", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(sourceSvg)));
  try {
    await act(async () => {
      root.render(createElement(JapanMapSvg, { fills: { saga: "target" } }));
    });
    const saga = container.querySelector('[data-prefecture-id="saga"]');
    expect(saga?.getAttribute("data-fill")).toBe("target");

    for (const label of ["地図を拡大", "地図の大きさをリセット"]) {
      const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(button).not.toBeNull();
      await act(async () => {
        button?.click();
      });
      expect(container.querySelector('[data-fill="target"]')).toBe(saga);
    }

    await act(async () => {
      root.render(createElement(JapanMapSvg, { fills: { fukuoka: "target" } }));
    });
    expect(saga?.hasAttribute("data-fill")).toBe(false);
    expect(container.querySelector('[data-fill="target"]')?.getAttribute("data-prefecture-id")).toBe("fukuoka");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
    container.remove();
  }
});
