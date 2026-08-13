import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyReviewBatch, validateMaterialSource } from "./kanji-content-lib.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const batchId = process.argv[2];
const nextSourceVersion = process.argv[3];
if (!batchId || !/^kanji-g[34]-\d{3}$/u.test(batchId)) throw new Error("レビューバッチIDが不正です");
if (!nextSourceVersion || !/^\d{4}\.\d{2}\.\d{2}-\d+$/u.test(nextSourceVersion)) throw new Error("次の素材版が不正です");

const sourcePath = resolve(projectRoot, "content-source/kanji-materials.json");
const batchPath = resolve(projectRoot, "content-review", `${batchId}.json`);
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const batch = JSON.parse(await readFile(batchPath, "utf8"));
const result = applyReviewBatch(source, batch);
if (result.counts.pending > 0) throw new Error(`未判断のレビューが${result.counts.pending}件あります`);
result.source.sourceVersion = nextSourceVersion;
validateMaterialSource(result.source);

// Validation completes before the source file is replaced.
await writeFile(sourcePath, `${JSON.stringify(result.source, null, 2)}\n`, "utf8");
console.log(`applied ${batchId}: approved=${result.counts.approved}, needs-fix=${result.counts.needsFix}`);
console.log(`updated ${sourcePath} to ${nextSourceVersion}`);
