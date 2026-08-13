import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createReviewBatchMarkdown } from "./kanji-content-lib.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const batchId = process.argv[2];
if (!batchId || !/^kanji-g[34]-\d{3}$/u.test(batchId)) throw new Error("レビューバッチIDが不正です");

const jsonPath = resolve(projectRoot, "content-review", `${batchId}.json`);
const markdownPath = resolve(projectRoot, "content-review", `${batchId}.md`);
const batch = JSON.parse(await readFile(jsonPath, "utf8"));
await writeFile(markdownPath, createReviewBatchMarkdown(batch), "utf8");
console.log(`generated ${markdownPath}`);
