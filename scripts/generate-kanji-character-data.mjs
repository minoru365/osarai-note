// Builds src/generated/kanjiCharacterData.ts from the KanjiVG SVGs in
// content-source/kanjivg (ADR-0010).
//
// KanjiVG draws each stroke as a centre line in a 109x109 box with y running
// down. Hanzi Writer wants filled outlines plus medians in a 0..1024 box with
// y running up between -124 and 900, so every stroke is sampled by arc length
// and then offset either side of the line to make a closed outline.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kanjivgRoot = resolve(projectRoot, "content-source/kanjivg");

/** Samples per stroke, and stroke thickness in the 1024 box. See ADR-0010. */
const SAMPLES_PER_STROKE = 10;
const STROKE_WIDTH = 31;
const KVG_BOX = 109;
const SCALE = 1024 / KVG_BOX;
/** Flattening resolution used only to measure arc length. */
const FLATTEN_STEPS = 24;

function parsePath(d) {
  // KanjiVG only ever uses M, C, c, S and s (checked across all 368 files).
  const tokens = d.match(/[MCScs]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const segments = [];
  let i = 0;
  let command = "";
  let current = [0, 0];
  let start = [0, 0];
  let previousControl = null;

  const num = () => Number(tokens[i++]);

  while (i < tokens.length) {
    if (/[MCScs]/.test(tokens[i])) command = tokens[i++];
    else if (command === "M") command = "C";

    if (command === "M") {
      current = [num(), num()];
      start = current;
      previousControl = null;
      command = "C";
      continue;
    }

    let c1;
    let c2;
    let end;
    if (command === "C" || command === "c") {
      const relative = command === "c";
      const base = relative ? current : [0, 0];
      c1 = [base[0] + num(), base[1] + num()];
      c2 = [base[0] + num(), base[1] + num()];
      end = [base[0] + num(), base[1] + num()];
    } else {
      // S/s reflect the previous control point through the current point.
      const relative = command === "s";
      const base = relative ? current : [0, 0];
      c1 = previousControl
        ? [2 * current[0] - previousControl[0], 2 * current[1] - previousControl[1]]
        : current;
      c2 = [base[0] + num(), base[1] + num()];
      end = [base[0] + num(), base[1] + num()];
    }

    segments.push([current, c1, c2, end]);
    previousControl = c2;
    current = end;
  }

  if (segments.length === 0) throw new Error(`ストロークを読み取れません: ${d}`);
  void start;
  return segments;
}

function cubicAt([p0, p1, p2, p3], t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1],
  ];
}

/** Evenly spaced points along the whole stroke, measured by arc length. */
function samplePath(segments, count) {
  const table = [];
  let total = 0;
  let previous = cubicAt(segments[0], 0);
  table.push({ length: 0, point: previous });
  for (const segment of segments) {
    for (let step = 1; step <= FLATTEN_STEPS; step++) {
      const point = cubicAt(segment, step / FLATTEN_STEPS);
      total += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
      table.push({ length: total, point });
      previous = point;
    }
  }

  if (total === 0) return Array.from({ length: count + 1 }, () => previous);

  const points = [];
  let cursor = 0;
  for (let index = 0; index <= count; index++) {
    const target = (total * index) / count;
    while (cursor < table.length - 2 && table[cursor + 1].length < target) cursor++;
    const a = table[cursor];
    const b = table[cursor + 1];
    const span = b.length - a.length;
    const ratio = span === 0 ? 0 : (target - a.length) / span;
    points.push([
      a.point[0] + (b.point[0] - a.point[0]) * ratio,
      a.point[1] + (b.point[1] - a.point[1]) * ratio,
    ]);
  }
  return points;
}

const toWriterSpace = ([x, y]) => [
  Math.round(x * SCALE),
  Math.round(900 - y * SCALE),
];

/** Closed monoline outline around the sampled centre line. */
function outline(points, width) {
  const half = width / 2;
  const left = [];
  const right = [];
  for (let index = 0; index < points.length; index++) {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    let dx = after[0] - before[0];
    let dy = after[1] - before[1];
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    left.push([points[index][0] - dy * half, points[index][1] + dx * half]);
    right.push([points[index][0] + dy * half, points[index][1] - dx * half]);
  }
  const format = (point) => `${Math.round(point[0])} ${Math.round(point[1])}`;
  return `M ${left.map(format).join(" L ")} L ${right.reverse().map(format).join(" L ")} Z`;
}

function buildCharacter(svg, character) {
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((match) => match[1]);
  if (paths.length === 0) throw new Error(`ストロークがありません: ${character}`);
  const strokes = [];
  const medians = [];
  for (const d of paths) {
    const sampled = samplePath(parsePath(d), SAMPLES_PER_STROKE).map(toWriterSpace);
    medians.push(sampled);
    strokes.push(outline(sampled, STROKE_WIDTH));
  }
  return { strokes, medians };
}

const source = JSON.parse(await readFile(resolve(projectRoot, "content-source/kanji-materials.json"), "utf8"));
const characters = [...new Set(source.materials
  .filter((material) => material.reviewStatus === "approved")
  .flatMap((material) => material.targetKanji))].sort((left, right) => left.localeCompare(right, "ja"));

const available = new Set((await readdir(kanjivgRoot))
  .filter((name) => name.endsWith(".svg"))
  .map((name) => String.fromCodePoint(Number.parseInt(name.slice(0, -4), 16))));

const missing = characters.filter((character) => !available.has(character));
if (missing.length > 0) {
  throw new Error(`承認済み問題のKanjiVGデータがありません: ${missing.join("")}`);
}

const entries = [];
for (const character of characters) {
  const hex = character.codePointAt(0).toString(16).padStart(5, "0");
  const svg = await readFile(resolve(kanjivgRoot, `${hex}.svg`), "utf8");
  entries.push(`  ${JSON.stringify(character)}: ${JSON.stringify(buildCharacter(svg, character))},`);
}

const output = `// Generated by scripts/generate-kanji-character-data.mjs. Do not edit directly.
//
// Derived from KanjiVG (Ulrich Apel, https://kanjivg.tagaini.net), which is
// licensed CC BY-SA 3.0. This generated file is a derivative work and carries
// the same licence. See THIRD-PARTY-NOTICES.md.
import type { CharacterJson } from "hanzi-writer";

export const generatedCharacterData: Record<string, CharacterJson> = {
${entries.join("\n")}
};
`;

const outputPath = resolve(projectRoot, "src/generated/kanjiCharacterData.ts");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, "utf8");
console.log(`generated ${outputPath} (${characters.length} characters)`);
