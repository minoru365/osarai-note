// Builds public/content/japan-map-v1.json.
//
// - prefecture-location: the 47 human-written questions in
//   content-source/japan-map-questions.json, copied as they are.
// - prefecture-name / prefecture-region (2026-11-27): generated from those
//   names and the 8-region table in content-source/japan-map-regions.json.
//   Choices are fixed per question, distinct, and contain the answer once.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "content-source/japan-map-questions.json");
const regionsPath = resolve(root, "content-source/japan-map-regions.json");
const outputPath = resolve(root, "public/content/japan-map-v1.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const regionSource = JSON.parse(await readFile(regionsPath, "utf8"));

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

/** Small deterministic hash, so choice order never changes between builds. */
function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function orderBy(items, salt) {
  return [...items].sort((left, right) => stableHash(`${salt}:${left}`) - stableHash(`${salt}:${right}`));
}

const regions = regionSource.regions;
const regionOf = new Map();
for (const region of regions) {
  for (const prefectureId of region.prefectures) {
    if (regionOf.has(prefectureId)) throw new Error(`2つの地方に入っています: ${prefectureId}`);
    regionOf.set(prefectureId, region);
  }
}
const regionById = new Map(regions.map((region) => [region.id, region]));
const nameOf = new Map(source.questions.map((question) => [question.prefectureId, question.answer]));
if (regionOf.size !== 47 || [...nameOf.keys()].some((id) => !regionOf.has(id))) {
  throw new Error("地方の表が47都道府県と一致しません");
}

/** Three other prefectures, from the same region first, then neighbouring ones. */
function nameDistractors(prefectureId) {
  const region = regionOf.get(prefectureId);
  const pool = [
    ...orderBy(region.prefectures.filter((id) => id !== prefectureId), prefectureId),
    ...region.neighbors.flatMap((neighbor) => orderBy(regionById.get(neighbor).prefectures, `${prefectureId}:${neighbor}`)),
  ];
  return [...new Set(pool)].slice(0, 3);
}

const nameQuestions = source.questions.map(({ prefectureId, answer }) => {
  const region = regionOf.get(prefectureId);
  const options = orderBy([prefectureId, ...nameDistractors(prefectureId)], `name:${prefectureId}`);
  return {
    id: `japan-map:name:${prefectureId}`,
    grade: 4,
    questionType: "prefecture-name",
    prefectureId,
    answer,
    prompt: "色のついた都道府県は、どこかな？",
    explanation: `${answer}です。${region.label}地方にあります。`,
    choices: options.map((id) => ({ id, label: nameOf.get(id) })),
    answerChoiceId: prefectureId,
  };
});

// 「北海道は何地方？」 answers itself, so it is not asked.
const regionQuestions = source.questions
  .filter(({ prefectureId }) => prefectureId !== "hokkaido")
  .map(({ prefectureId, answer }) => {
    const region = regionOf.get(prefectureId);
    const options = orderBy([region.id, ...region.neighbors], `region:${prefectureId}`);
    return {
      id: `japan-map:region:${prefectureId}`,
      grade: 4,
      questionType: "prefecture-region",
      prefectureId,
      answer: `${region.label}地方`,
      prompt: `${answer}は、何地方かな？`,
      explanation: `${answer}は、${region.label}地方にあります。`,
      choices: options.map((id) => ({ id, label: `${regionById.get(id).label}地方` })),
      answerChoiceId: region.id,
    };
  });

const questions = [...source.questions, ...nameQuestions, ...regionQuestions];
const allIds = new Set();
for (const question of questions) {
  if (allIds.has(question.id)) throw new Error(`問題IDが重複しています: ${question.id}`);
  allIds.add(question.id);
  if (question.choices) {
    const choiceIds = question.choices.map((choice) => choice.id);
    if (new Set(choiceIds).size !== choiceIds.length || choiceIds.filter((id) => id === question.answerChoiceId).length !== 1) {
      throw new Error(`選択肢が不正です: ${question.id}`);
    }
  }
}

const pack = {
  schemaVersion: 1,
  packId: "japan-map-v1",
  contentVersion: source.contentVersion,
  questions,
};
await writeFile(outputPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
console.log(`generated japan map pack: ${questions.length} questions (location ${source.questions.length}, name ${nameQuestions.length}, region ${regionQuestions.length})`);
