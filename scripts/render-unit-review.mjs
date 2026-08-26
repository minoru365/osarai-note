// Renders the reviewed-material drafts as a page a person can read and decide
// on (docs/units-plan.md 7.2), the units counterpart of
// render-kanji-review-visualization.mjs.
//
//   node --experimental-strip-types scripts/render-unit-review.mjs <出力先.html>
//
// The page is built from content-source/unit-materials.json through the same
// question builders the pack uses, so what a reviewer reads is exactly what a
// child would see. Decisions are kept in the reviewer's browser only; nothing
// is written back to the repository.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReviewedQuestions, readMaterials } from "./unit-content-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = process.argv[2];
if (!output) {
  console.error("使い方: node --experimental-strip-types scripts/render-unit-review.mjs <出力先.html>");
  process.exit(1);
}

const materials = readMaterials(join(ROOT, "content-source", "unit-materials.json"));
const questions = buildReviewedQuestions(materials, { includeDrafts: true });

const SECTIONS = [
  { type: "appropriateUnit", title: "適切な単位", lead: "はかる単位を選ぶ問題。対象と単位の対応が正しいかを見てください。" },
  { type: "senseEstimate", title: "量感", lead: "だいたいの分量を選ぶ問題。実際の分量として正しいかを見てください。" },
  { type: "wordProblem", title: "文章題", lead: "文章の自然さ、意味、計算が合っているかを見てください。" },
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function renderChoices(question) {
  if (question.answerType !== "choice") return "";
  return `<ul class="choices">${question.choices.map((choice) => {
    const correct = choice.id === question.answerChoiceId;
    return `<li class="${correct ? "correct" : ""}">`
      + `<span class="mark" aria-hidden="true">${correct ? "○" : "　"}</span>`
      + `<span>${escapeHtml(choice.label)}</span>`
      + `${correct ? '<span class="sr-only">（正解）</span>' : ""}</li>`;
  }).join("")}</ul>`;
}

function renderAnswer(question) {
  if (question.answerType !== "numeric") return "";
  return `<p class="answer"><span class="label">こたえ</span>`
    + `<strong>${escapeHtml(question.answerText)}</strong></p>`;
}

function renderCard(question, index) {
  return `<article class="card" data-id="${escapeHtml(question.materialId)}">
  <header>
    <span class="num">${index + 1}</span>
    <span class="grade">${question.grade}年</span>
    <code>${escapeHtml(question.materialId)}</code>
  </header>
  <p class="prompt">${escapeHtml(question.prompt)}</p>
  ${renderChoices(question)}
  ${renderAnswer(question)}
  <p class="explanation">${escapeHtml(question.explanation)}</p>
  <div class="decide" role="group" aria-label="${escapeHtml(question.materialId)} の判断">
    <button type="button" data-decision="approve">これでOK</button>
    <button type="button" data-decision="needs-fix">要修正</button>
  </div>
</article>`;
}

const sectionsHtml = SECTIONS.map((section) => {
  const items = questions.filter((question) => question.questionType === section.type);
  return `<section class="group">
  <div class="group-head">
    <h2>${section.title}</h2>
    <span class="count">${items.length}件</span>
  </div>
  <p class="lead">${section.lead}</p>
  <div class="cards">${items.map(renderCard).join("\n")}</div>
</section>`;
}).join("\n");

const html = `<title>たんい問題の下書き確認</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700&family=Noto+Sans+JP:wght@400;500&family=Roboto+Mono:wght@400;500&display=swap">
<style>
:root {
  --paper: #f6f8fa;
  --card: #ffffff;
  --grid: #dde5ed;
  --ink: #1d262e;
  --ink-soft: #5a6771;
  --ink-faint: #8a959e;
  --rule: #d9e1e9;
  --accent: #2f6f8f;
  --accent-soft: #e8f1f6;
  --ok: #3f7d5c;
  --ok-soft: #e9f3ee;
  --fix: #a8641c;
  --fix-soft: #fbf1e3;
}
:root:not([data-theme="light"]) { color-scheme: light; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #11161b;
    --card: #182027;
    --grid: #1f2831;
    --ink: #e3e9ef;
    --ink-soft: #a2aeb9;
    --ink-faint: #78848f;
    --rule: #2a343d;
    --accent: #74b6d4;
    --accent-soft: #1b2c36;
    --ok: #7cc09c;
    --ok-soft: #17281f;
    --fix: #d8a463;
    --fix-soft: #2a2117;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --paper: #11161b;
  --card: #182027;
  --grid: #1f2831;
  --ink: #e3e9ef;
  --ink-soft: #a2aeb9;
  --ink-faint: #78848f;
  --rule: #2a343d;
  --accent: #74b6d4;
  --accent-soft: #1b2c36;
  --ok: #7cc09c;
  --ok-soft: #17281f;
  --fix: #d8a463;
  --fix-soft: #2a2117;
  color-scheme: dark;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0 0 96px;
  color: var(--ink);
  background-color: var(--paper);
  /* 方眼紙。この教科の作業面そのもの。 */
  background-image:
    linear-gradient(var(--grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 28px 28px;
  font-family: "Noto Sans JP", system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.75;
  -webkit-text-size-adjust: 100%;
}
.wrap { max-width: 46rem; margin: 0 auto; padding: 0 20px; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

header.page {
  padding: 44px 0 28px;
  border-bottom: 2px solid var(--ink);
  margin-bottom: 36px;
}
.eyebrow {
  margin: 0 0 10px;
  color: var(--accent);
  font-family: "Roboto Mono", ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: .16em;
  text-transform: uppercase;
}
h1 {
  margin: 0 0 14px;
  font-family: "Zen Kaku Gothic New", "Noto Sans JP", sans-serif;
  font-size: clamp(28px, 6vw, 38px);
  font-weight: 700;
  line-height: 1.3;
  text-wrap: balance;
}
header.page p { margin: 0; max-width: 34rem; color: var(--ink-soft); }

.group { margin-bottom: 52px; }
.group-head {
  display: flex; align-items: baseline; gap: 12px;
  padding-bottom: 8px; border-bottom: 1px solid var(--rule);
}
h2 {
  margin: 0;
  font-family: "Zen Kaku Gothic New", "Noto Sans JP", sans-serif;
  font-size: 22px; font-weight: 700;
}
.count {
  color: var(--ink-faint);
  font-family: "Roboto Mono", ui-monospace, monospace;
  font-size: 13px; font-variant-numeric: tabular-nums;
}
.lead { margin: 12px 0 20px; color: var(--ink-soft); font-size: 14.5px; }

.cards { display: flex; flex-direction: column; gap: 16px; }
.card {
  padding: 18px 20px 16px;
  border: 1px solid var(--rule);
  border-left: 4px solid var(--rule);
  border-radius: 3px;
  background: var(--card);
  transition: border-left-color .15s ease;
}
.card[data-decision="approve"] { border-left-color: var(--ok); }
.card[data-decision="needs-fix"] { border-left-color: var(--fix); }

.card header {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 10px;
  color: var(--ink-faint);
  font-family: "Roboto Mono", ui-monospace, monospace;
  font-size: 11.5px;
}
.num { font-variant-numeric: tabular-nums; }
.grade {
  padding: 1px 7px; border-radius: 2px;
  color: var(--accent); background: var(--accent-soft);
  font-size: 11px;
}
.card header code { margin-left: auto; overflow-wrap: anywhere; }

.prompt {
  margin: 0 0 12px;
  font-family: "Zen Kaku Gothic New", "Noto Sans JP", sans-serif;
  font-size: 18px; font-weight: 500; line-height: 1.65;
}
.choices { display: flex; flex-direction: column; gap: 5px; margin: 0 0 12px; padding: 0; list-style: none; }
.choices li {
  display: flex; align-items: baseline; gap: 8px;
  padding: 5px 10px; border-radius: 3px;
  color: var(--ink-soft);
  font-family: "Roboto Mono", "Noto Sans JP", monospace;
  font-size: 15px;
}
.choices li.correct { color: var(--ok); background: var(--ok-soft); font-weight: 500; }
.mark { width: 1em; }
.answer { display: flex; align-items: baseline; gap: 10px; margin: 0 0 12px; }
.answer .label {
  color: var(--ink-faint);
  font-family: "Roboto Mono", ui-monospace, monospace;
  font-size: 11px; letter-spacing: .1em;
}
.answer strong {
  color: var(--ok);
  font-family: "Roboto Mono", "Noto Sans JP", monospace;
  font-size: 19px; font-variant-numeric: tabular-nums;
}
.explanation {
  margin: 0 0 14px; padding-left: 12px;
  border-left: 2px solid var(--rule);
  color: var(--ink-soft); font-size: 14px;
}

.decide { display: flex; gap: 8px; }
.decide button {
  flex: 1; min-height: 42px; padding: 0 12px;
  border: 1px solid var(--rule); border-radius: 3px;
  color: var(--ink-soft); background: transparent;
  font: inherit; font-size: 14px; cursor: pointer;
  transition: background .12s ease, color .12s ease, border-color .12s ease;
}
.decide button:hover { border-color: var(--ink-faint); }
.decide button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.card[data-decision="approve"] button[data-decision="approve"] {
  color: var(--ok); border-color: var(--ok); background: var(--ok-soft); font-weight: 500;
}
.card[data-decision="needs-fix"] button[data-decision="needs-fix"] {
  color: var(--fix); border-color: var(--fix); background: var(--fix-soft); font-weight: 500;
}

.summary {
  position: fixed; inset: auto 0 0 0; z-index: 10;
  border-top: 1px solid var(--rule);
  background: var(--card);
  box-shadow: 0 -6px 24px rgb(0 0 0 / .07);
}
.summary .wrap {
  display: flex; align-items: center; gap: 14px;
  padding-top: 10px; padding-bottom: 10px;
  font-family: "Roboto Mono", ui-monospace, monospace;
  font-size: 12.5px; font-variant-numeric: tabular-nums;
}
.summary .fill { flex: 1; color: var(--ink-faint); overflow-wrap: anywhere; }
.summary b { color: var(--ok); font-weight: 500; }
.summary i { color: var(--fix); font-style: normal; }
.summary button {
  padding: 6px 10px; border: 1px solid var(--rule); border-radius: 3px;
  color: var(--ink-soft); background: transparent; font: inherit; cursor: pointer;
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>

<div class="wrap">
  <header class="page">
    <p class="eyebrow">unit materials / draft review</p>
    <h1>たんい問題の下書き確認</h1>
    <p>公開前の下書き ${questions.length} 件です。1件ずつ「これでOK」か「要修正」を選んでください。判断はこの端末の中だけに残ります。最後に下のバーの要修正IDを伝えてもらえれば、直します。</p>
  </header>
${sectionsHtml}
</div>

<div class="summary">
  <div class="wrap">
    <span><b id="ok-count">0</b> OK / <i id="fix-count">0</i> 要修正 / <span id="left-count">${questions.length}</span> 未確認</span>
    <span class="fill" id="fix-ids"></span>
    <button type="button" id="reset">やり直す</button>
  </div>
</div>

<script>
(function () {
  var KEY = "unit-review-decisions";
  var store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { store = {}; }

  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode */ }
  }

  function render() {
    var ok = 0, fix = 0, fixIds = [];
    cards.forEach(function (card) {
      var id = card.getAttribute("data-id");
      var decision = store[id];
      if (decision) card.setAttribute("data-decision", decision);
      else card.removeAttribute("data-decision");
      if (decision === "approve") ok++;
      if (decision === "needs-fix") { fix++; fixIds.push(id); }
    });
    document.getElementById("ok-count").textContent = ok;
    document.getElementById("fix-count").textContent = fix;
    document.getElementById("left-count").textContent = cards.length - ok - fix;
    document.getElementById("fix-ids").textContent = fixIds.length ? fixIds.join(" ") : "";
  }

  cards.forEach(function (card) {
    card.querySelectorAll(".decide button").forEach(function (button) {
      button.addEventListener("click", function () {
        var id = card.getAttribute("data-id");
        var decision = button.getAttribute("data-decision");
        if (store[id] === decision) delete store[id];
        else store[id] = decision;
        save();
        render();
      });
    });
  });

  document.getElementById("reset").addEventListener("click", function () {
    store = {};
    save();
    render();
  });

  render();
})();
</script>
`;

writeFileSync(output, html, "utf8");
console.log(`generated ${output}`);
console.log(`questions: ${questions.length}`);
