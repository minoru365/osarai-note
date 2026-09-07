// 学年の未確認素材を一括で確認できるレビュー票を生成する。
// 通常の100件バッチとは別の作業用で、公開前に全件の判定が必要。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createReviewBatch, createReviewBatchMarkdown } from "./kanji-content-lib.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const grade = Number(process.argv[2] ?? 4);
if (grade !== 4) throw new Error("一括レビューは4年生だけを対象にします");

const batchId = `kanji-g${grade}-all`;
const source = JSON.parse(await readFile(resolve(projectRoot, "content-source/kanji-materials.json"), "utf8"));
const batch = createReviewBatch(source, { batchId, grade, all: true });
const outputDirectory = resolve(projectRoot, "content-review");
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDirectory, `${batchId}.json`), `${JSON.stringify(batch, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDirectory, `${batchId}.md`), createReviewBatchMarkdown(batch), "utf8"),
]);

console.log(`generated ${batchId}: ${batch.entries.length}件`);
