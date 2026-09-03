// レビューバッチJSONから、単体で開ける確認ページを決定的に生成する。
// 出力はArtifactの本文としてそのまま公開できる断片（<title>と<style>から始まる）で、
// ブラウザで直接開いても読める。判断はArtifactのdb機能があれば保存し、
// 無い環境ではコピー用の文面を出す。
//
// 使い方: node scripts/render-kanji-review-page.mjs kanji-g4-002 /path/to/page.html
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createReviewPage } from "./kanji-review-page-lib.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const batchId = process.argv[2];
const outputPath = process.argv[3];
if (!batchId || !/^kanji-g[34]-\d{3}$/u.test(batchId)) throw new Error("レビューバッチIDが不正です");
if (!outputPath) throw new Error("出力先を指定してください");

const batch = JSON.parse(await readFile(resolve(projectRoot, "content-review", `${batchId}.json`), "utf8"));
await writeFile(resolve(outputPath), createReviewPage(batch), "utf8");
console.log(`generated ${resolve(outputPath)}`);
