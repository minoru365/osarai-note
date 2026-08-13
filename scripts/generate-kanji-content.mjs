import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createCoverageMarkdown, createReviewMarkdown, createWordCandidateMarkdown, generateKanjiPack, validateMaterialsAgainstReference } from "./kanji-content-lib.mjs";
import "./generate-kanji-character-data.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(projectRoot, "content-source/kanji-materials.json");
const referencePath = resolve(projectRoot, "content-source/joyo-readings-2010.json");
const candidatePath = resolve(projectRoot, "content-source/kanji-word-candidates.json");
const packPath = resolve(projectRoot, "public/content/kanji-v2.json");
const reviewPath = resolve(projectRoot, "docs/generated/kanji-review.md");
const coveragePath = resolve(projectRoot, "docs/generated/kanji-reading-coverage.md");
const candidateReviewPath = resolve(projectRoot, "docs/generated/kanji-word-candidates.md");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const reference = JSON.parse(await readFile(referencePath, "utf8"));
const candidates = JSON.parse(await readFile(candidatePath, "utf8"));

// Everything is created in memory first. Validation failures leave published files untouched.
validateMaterialsAgainstReference(source, reference);
const packText = `${JSON.stringify(generateKanjiPack(source), null, 2)}\n`;
const reviewText = createReviewMarkdown(source);
const coverageText = createCoverageMarkdown(source, reference);
const candidateReviewText = createWordCandidateMarkdown(candidates, reference);
await Promise.all([
  writeFile(packPath, packText, "utf8"),
  writeFile(reviewPath, reviewText, "utf8"),
  writeFile(coveragePath, coverageText, "utf8"),
  writeFile(candidateReviewPath, candidateReviewText, "utf8"),
]);

console.log(`generated ${packPath}`);
console.log(`generated ${reviewPath}`);
console.log(`generated ${coveragePath}`);
console.log(`generated ${candidateReviewPath}`);
