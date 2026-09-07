import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "content-source/japan-map-questions.json");
const outputPath = resolve(root, "public/content/japan-map-v1.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));

if (source.schemaVersion !== 1 || !Array.isArray(source.questions) || source.questions.length !== 47) {
  throw new Error("日本地図問題の素材は47問である必要があります");
}

const ids = new Set();
for (const question of source.questions) {
  if (!question.id || ids.has(question.id) || question.grade !== 4
    || question.questionType !== "prefecture-location"
    || !question.prefectureId || !question.answer || !question.prompt || !question.explanation) {
    throw new Error(`日本地図問題の形式が不正です: ${question.id ?? "unknown"}`);
  }
  ids.add(question.id);
}

const pack = {
  schemaVersion: 1,
  packId: "japan-map-v1",
  contentVersion: source.contentVersion,
  questions: source.questions,
};
await writeFile(outputPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
console.log(`generated japan map pack: ${source.questions.length} questions`);
