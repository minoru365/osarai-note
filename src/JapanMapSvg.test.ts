import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { addPrefectureDataAttributes } from "./japanMapSvgContent";

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
});
