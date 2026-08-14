import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createReviewVisualization } from "./kanji-review-visualization-lib.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const batchId = process.argv[2];
const outputArgument = process.argv[3];
if (!batchId || !/^kanji-g[34]-\d{3}$/u.test(batchId)) throw new Error("レビューバッチIDが不正です");
if (!outputArgument) throw new Error("出力先HTMLパスを指定してください");

const batchPath = resolve(projectRoot, "content-review", `${batchId}.json`);
const outputPath = isAbsolute(outputArgument) ? outputArgument : resolve(projectRoot, outputArgument);
const batch = JSON.parse(await readFile(batchPath, "utf8"));
const fragment = createReviewVisualization(batch);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, fragment, "utf8");
console.log(`generated ${outputPath}`);
