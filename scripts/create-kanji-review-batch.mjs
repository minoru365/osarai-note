import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createReviewBatch, createReviewBatchMarkdown } from "./kanji-content-lib.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const grade = Number(process.argv[2] ?? 3);
const batchNumber = Number(process.argv[3] ?? 1);
const limit = Number(process.argv[4] ?? 20);
if (!Number.isInteger(batchNumber) || batchNumber < 1) throw new Error("バッチ番号が不正です");

const batchId = `kanji-g${grade}-${String(batchNumber).padStart(3, "0")}`;
const source = JSON.parse(await readFile(resolve(projectRoot, "content-source/kanji-materials.json"), "utf8"));
const batch = createReviewBatch(source, { batchId, grade, limit });
const outputDirectory = resolve(projectRoot, "content-review");
const jsonPath = resolve(outputDirectory, `${batchId}.json`);
const markdownPath = resolve(outputDirectory, `${batchId}.md`);

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(jsonPath, `${JSON.stringify(batch, null, 2)}\n`, "utf8"),
  writeFile(markdownPath, createReviewBatchMarkdown(batch), "utf8"),
]);

console.log(`generated ${jsonPath}`);
console.log(`generated ${markdownPath}`);
