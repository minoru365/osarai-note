// Keeps the generated illustration set safe to ship offline without adding a
// runtime image dependency to the app.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "public", "pets");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

function decodePng(file) {
  const data = readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
    } else if (type === "IDAT") {
      idat.push(chunk);
    }
  }
  if (bitDepth !== 8 || colorType !== 6) return { width, height, hasTransparent: false, hasOpaque: false };

  const bytesPerPixel = 4;
  const rowBytes = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(idat));
  let rawOffset = 0;
  let previous = Buffer.alloc(rowBytes);
  let hasTransparent = false;
  let hasOpaque = false;
  const paeth = (left, above, upperLeft) => {
    const estimate = left + above - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const aboveDistance = Math.abs(estimate - above);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
    if (aboveDistance <= upperLeftDistance) return above;
    return upperLeft;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const current = Buffer.alloc(rowBytes);
    for (let index = 0; index < rowBytes; index += 1) {
      const left = index >= bytesPerPixel ? current[index - bytesPerPixel] : 0;
      const above = previous[index];
      const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
      const encoded = raw[rawOffset++];
      const predictor = filter === 0
        ? 0
        : filter === 1
          ? left
          : filter === 2
            ? above
            : filter === 3
              ? Math.floor((left + above) / 2)
              : paeth(left, above, upperLeft);
      current[index] = (encoded + predictor) & 255;
    }
    for (let index = 3; index < rowBytes; index += 4) {
      hasTransparent ||= current[index] === 0;
      hasOpaque ||= current[index] === 255;
    }
    previous = current;
  }
  return { width, height, hasTransparent, hasOpaque };
}

describe("ペット画像素材", () => {
  it("3職種×5段階×2状態×2フレームの60枚を持つ", () => {
    const expected = [];
    for (const [species, role] of [["hiyoko", "hero"], ["usagi", "princess"], ["kitsune", "mage"]]) {
      for (let stage = 1; stage <= 5; stage += 1) {
        for (const mood of ["happy", "waiting"]) {
          for (const frame of ["a", "b"]) {
            expected.push(`${species}-${role}-stage-${String(stage).padStart(2, "0")}-${mood}-${frame}.png`);
          }
        }
      }
    }
    expect(manifest.format).toBe("png");
    expect(manifest.width).toBe(256);
    expect(manifest.height).toBe(256);
    expect(manifest.assets).toEqual(expected);
    expect(readdirSync(ROOT).filter((file) => file.endsWith(".png")).sort()).toEqual([...expected].sort());
  });

  it("全画像が256pxの透過PNGとしてデコードできる", () => {
    const invalid = manifest.assets.filter((asset) => {
      const decoded = decodePng(join(ROOT, asset));
      return decoded.width !== 256 || decoded.height !== 256 || !decoded.hasTransparent;
    });
    expect(invalid).toEqual([]);
  });
});
