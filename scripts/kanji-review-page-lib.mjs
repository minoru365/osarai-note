import { describeProposal } from "./kanji-content-lib.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/gu, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

const scriptJson = (value) => JSON.stringify(value)
  .replaceAll("<", "\\u003c")
  .replaceAll(">", "\\u003e")
  .replaceAll("&", "\\u0026")
  .replaceAll(" ", "\\u2028")
  .replaceAll(" ", "\\u2029");

export function reviewPageRows(batch) {
  return batch.entries.map((entry, index) => {
    const proposed = entry.proposed;
    const split = describeProposal(proposed);
    return {
      n: index + 1,
      id: String(index + 1).padStart(3, "0"),
      pairId: entry.pairId,
      kanji: entry.primaryKanji,
      type: entry.readingType === "on" ? "音" : "訓",
      base: entry.canonicalReading,
      word: proposed.word,
      reading: proposed.wordReading,
      before: proposed.promptBefore,
      after: proposed.promptAfter,
      // 承認したときに児童の画面へ出る形。読みは語句を強調し、書きは漢字部分を読みへ置き換える。
      answerKanji: split.answerKanji ?? "",
      answerReading: split.answerReading ?? "",
      readingBefore: split.readingBefore ?? "",
      readingAfter: split.readingAfter ?? "",
      blocker: split.error ?? "",
      decision: entry.decision,
      note: entry.note ?? "",
    };
  });
}

export function createReviewPage(batch) {
  assert(batch?.schemaVersion === 1 && typeof batch.batchId === "string", "レビューバッチの形式が不正です");
  assert((batch.grade === 3 || batch.grade === 4) && Array.isArray(batch.entries) && batch.entries.length > 0,
    "レビュー項目がありません");
  const rows = reviewPageRows(batch);
  const proposedFixes = rows.filter((row) => row.decision === "needs-fix").length;

  return `<title>${escapeHtml(batch.batchId)} 例文レビュー</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">
<style>
  :root {
    --paper: #fbfaf7;
    --surface: #ffffff;
    --ink: #23272e;
    --ink-soft: #6a6a62;
    --rule: #ddd9d0;
    --rule-strong: #c6c1b5;
    --accent: #2f6b52;
    --accent-soft: #e8f0ea;
    --pen: #b4432c;
    --pen-soft: #f8ebe7;
    --shadow: 0 1px 0 rgba(35, 39, 46, .04);
    --serif: "Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif;
    --sans: "Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", system-ui, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #191c1f;
      --surface: #212528;
      --ink: #e7e4dc;
      --ink-soft: #9b988f;
      --rule: #33383c;
      --rule-strong: #474d52;
      --accent: #7fbd9d;
      --accent-soft: #1e2f28;
      --pen: #e08a72;
      --pen-soft: #33221e;
      --shadow: none;
    }
  }
  :root[data-theme="dark"] {
    --paper: #191c1f;
    --surface: #212528;
    --ink: #e7e4dc;
    --ink-soft: #9b988f;
    --rule: #33383c;
    --rule-strong: #474d52;
    --accent: #7fbd9d;
    --accent-soft: #1e2f28;
    --pen: #e08a72;
    --pen-soft: #33221e;
    --shadow: none;
  }

  body { background: var(--paper); color: var(--ink); font-family: var(--sans); line-height: 1.7; }
  * { box-sizing: border-box; }
  .wrap { max-width: 960px; margin: 0 auto; padding: 28px 20px 96px; }

  .masthead { display: grid; gap: 6px; padding-bottom: 20px; border-bottom: 2px solid var(--rule-strong); }
  .eyebrow { font-size: 12px; letter-spacing: .16em; color: var(--ink-soft); font-weight: 500; }
  .masthead h1 { font-family: var(--serif); font-size: 30px; font-weight: 600; margin: 0; text-wrap: balance; }
  .masthead p { margin: 4px 0 0; color: var(--ink-soft); font-size: 14px; max-width: 60ch; }

  .bar { position: sticky; top: 0; z-index: 5; background: var(--paper);
    border-bottom: 1px solid var(--rule); padding: 12px 0; margin-bottom: 4px;
    display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: center; }
  .tally { display: flex; gap: 16px; font-size: 13px; font-variant-numeric: tabular-nums; }
  .tally b { font-size: 19px; font-weight: 700; margin-right: 3px; }
  .tally .t-open b { color: var(--ink); }
  .tally .t-ok b { color: var(--accent); }
  .tally .t-fix b { color: var(--pen); }
  .spacer { flex: 1 1 auto; }
  .filters { display: flex; gap: 4px; }
  button { font: inherit; font-family: var(--sans); cursor: pointer; border-radius: 6px; }
  .chip { background: transparent; border: 1px solid var(--rule-strong); color: var(--ink-soft);
    padding: 5px 11px; font-size: 13px; }
  .chip[aria-pressed="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .act { background: var(--surface); border: 1px solid var(--rule-strong); color: var(--ink);
    padding: 6px 13px; font-size: 13px; }
  .act:hover { border-color: var(--ink-soft); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .status { font-size: 13px; color: var(--ink-soft); padding: 8px 0 0; min-height: 22px; }
  .status[data-tone="warn"] { color: var(--pen); }

  .rows { display: flex; flex-direction: column; }
  .row { display: grid; grid-template-columns: 128px 1fr; gap: 4px 20px;
    padding: 18px 0 18px 14px; border-bottom: 1px solid var(--rule);
    border-left: 4px solid transparent; }
  .row[data-decision="approve"] { border-left-color: var(--accent); }
  .row[data-decision="needs-fix"] { border-left-color: var(--pen); background: var(--pen-soft); }
  .row[hidden] { display: none; }

  .ident { display: grid; gap: 2px; align-content: start; }
  .num { font-size: 12px; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
  .glyph { font-family: var(--serif); font-size: 34px; line-height: 1.1; }
  .base { font-size: 12px; color: var(--ink-soft); }
  .lex { font-family: var(--serif); font-size: 15px; margin-top: 6px; }
  .lex small { display: block; font-family: var(--sans); font-size: 12px; color: var(--ink-soft); }

  .body { display: grid; gap: 10px; min-width: 0; }
  .line { display: grid; grid-template-columns: 42px 1fr; gap: 10px; align-items: baseline; }
  .tag { font-size: 11px; letter-spacing: .1em; color: var(--ink-soft); padding-top: 3px; }
  .sentence { font-family: var(--serif); font-size: 17px; line-height: 1.85; }
  .sentence mark { background: var(--accent-soft); color: var(--ink);
    padding: 1px 3px; border-radius: 3px; box-decoration-break: clone; }
  .sentence .blank { border-bottom: 2px solid var(--pen); padding: 0 2px; }
  .ans { font-size: 13px; color: var(--ink-soft); font-family: var(--sans); }
  .ans b { color: var(--ink); font-weight: 500; }

  .blocker { font-size: 13px; color: var(--pen); background: var(--pen-soft);
    border: 1px solid var(--pen); border-radius: 6px; padding: 7px 10px; }

  .verdict { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 2px; }
  .vote { border: 1px solid var(--rule-strong); background: var(--surface); color: var(--ink-soft);
    padding: 7px 15px; font-size: 14px; min-height: 40px; }
  .vote[aria-pressed="true"][data-vote="approve"] { background: var(--accent); border-color: var(--accent); color: #fff; }
  .vote[aria-pressed="true"][data-vote="needs-fix"] { background: var(--pen); border-color: var(--pen); color: #fff; }
  .note { flex: 1 1 240px; min-width: 0; font: inherit; font-size: 14px; font-family: var(--sans);
    padding: 8px 10px; border: 1px solid var(--rule-strong); border-radius: 6px;
    background: var(--surface); color: var(--ink); }
  .note::placeholder { color: var(--ink-soft); }

  .outro { margin-top: 28px; padding-top: 20px; border-top: 2px solid var(--rule-strong); display: grid; gap: 12px; }
  .outro h2 { font-family: var(--serif); font-size: 18px; margin: 0; font-weight: 600; }
  .summary { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
    white-space: pre-wrap; word-break: break-word; background: var(--surface);
    border: 1px solid var(--rule); border-radius: 8px; padding: 14px; max-height: 260px; overflow: auto; }

  @media (max-width: 640px) {
    .row { grid-template-columns: 1fr; }
    .ident { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .lex { margin-top: 0; }
    .lex small { display: inline; margin-left: 8px; }
  }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>

<div class="wrap">
  <header class="masthead">
    <div class="eyebrow">おさらいノート／問題レビュー</div>
    <h1>${escapeHtml(batch.batchId)}　${batch.grade}年生 ${rows.length}件</h1>
    <p>語句の読み、送り仮名、例文の自然さ、${batch.grade}年生までの表記を確認します。「読み」は語句を強調した出題、「書き」は漢字部分を読みに置きかえた出題で、どちらも同じ例文を使います。</p>
  </header>

  <div class="bar">
    <div class="tally">
      <span class="t-open"><b data-count="pending">0</b>未判断</span>
      <span class="t-ok"><b data-count="approve">0</b>OK</span>
      <span class="t-fix"><b data-count="needs-fix">0</b>要修正</span>
    </div>
    <div class="spacer"></div>
    <div class="filters" role="group" aria-label="表示するもの">
      <button class="chip" type="button" data-filter="all" aria-pressed="true">すべて</button>
      <button class="chip" type="button" data-filter="pending" aria-pressed="false">未判断</button>
      <button class="chip" type="button" data-filter="needs-fix" aria-pressed="false">要修正</button>
    </div>
    <button class="act" type="button" data-action="all-ok">残りを全部OK</button>
  </div>
  <p class="status" data-role="status"></p>

  <div class="rows" data-role="rows"></div>

  <section class="outro">
    <h2>判定を伝える</h2>
    <p style="margin:0;color:var(--ink-soft);font-size:14px;max-width:60ch;">この文面をコピーして会話へ貼ると、レビューバッチへ反映できます。判断が保存できる環境では、貼らなくてもそのまま読み取れます。</p>
    <div class="summary" data-role="summary"></div>
    <div><button class="act" type="button" data-action="copy">文面をコピー</button></div>
  </section>
</div>

<script>
(() => {
  const ROWS = ${scriptJson(rows)};
  const BATCH_ID = ${scriptJson(batch.batchId)};
  const COLLECTION = "reviews/" + BATCH_ID + "/entries";
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const state = new Map(ROWS.map((row) => [row.id, { decision: row.decision, note: row.note }]));
  const container = document.querySelector('[data-role="rows"]');
  const statusLine = document.querySelector('[data-role="status"]');
  const summaryBox = document.querySelector('[data-role="summary"]');
  let filter = "all";
  let db = null;

  const say = (text, tone) => { statusLine.textContent = text; statusLine.dataset.tone = tone || ""; };

  const sentenceHtml = (row) => esc(row.before) + "<mark>" + esc(row.word) + "</mark>" + esc(row.after);
  const writingHtml = (row) => {
    if (row.blocker) return '<span class="ans">この行は書き問題を作れません</span>';
    return esc(row.before) + esc(row.readingBefore)
      + '<span class="blank">「' + esc(row.answerReading) + '」</span>'
      + esc(row.readingAfter) + esc(row.after);
  };

  container.innerHTML = ROWS.map((row) => \`<article class="row" data-id="\${row.id}">
    <div class="ident">
      <span class="num">#\${row.n}</span>
      <span class="glyph">\${esc(row.kanji)}</span>
      <span class="base">\${esc(row.type)}　\${esc(row.base)}</span>
      <span class="lex">\${esc(row.word)}<small>\${esc(row.reading)}</small></span>
    </div>
    <div class="body">
      <div class="line"><span class="tag">読み</span><span class="sentence">\${sentenceHtml(row)}</span></div>
      <div class="line"><span class="tag"></span><span class="ans">答え <b>\${esc(row.answerReading || "—")}</b>　出す字 <b>\${esc(row.answerKanji || "—")}</b></span></div>
      <div class="line"><span class="tag">書き</span><span class="sentence">\${writingHtml(row)}</span></div>
      \${row.blocker ? '<p class="blocker">機械検査でとまります：' + esc(row.blocker) + '</p>' : ""}
      <div class="verdict">
        <button class="vote" type="button" data-vote="approve" aria-pressed="false">OK</button>
        <button class="vote" type="button" data-vote="needs-fix" aria-pressed="false">要修正</button>
        <input class="note" type="text" data-role="note" placeholder="直したいことを書く" value="\${esc(row.note)}">
      </div>
    </div>
  </article>\`).join("");

  const paint = () => {
    const counts = { pending: 0, approve: 0, "needs-fix": 0 };
    for (const row of ROWS) {
      const current = state.get(row.id);
      counts[current.decision] += 1;
      const element = container.querySelector('[data-id="' + row.id + '"]');
      element.dataset.decision = current.decision;
      element.hidden = filter !== "all" && current.decision !== filter;
      for (const button of element.querySelectorAll(".vote")) {
        button.setAttribute("aria-pressed", String(button.dataset.vote === current.decision));
      }
    }
    for (const [key, value] of Object.entries(counts)) {
      document.querySelector('[data-count="' + key + '"]').textContent = value;
    }
    const ok = ROWS.filter((row) => state.get(row.id).decision === "approve").map((row) => row.n);
    const fixes = ROWS.filter((row) => state.get(row.id).decision === "needs-fix")
      .map((row) => "#" + row.n + " " + (state.get(row.id).note.trim() || "要修正"));
    summaryBox.textContent = BATCH_ID + " のレビュー結果です。\\nOK: " + (ok.join(", ") || "なし")
      + "\\n要修正:\\n" + (fixes.join("\\n") || "なし")
      + (counts.pending ? "\\n（未判断が" + counts.pending + "件あります）" : "")
      + "\\n承認内容をレビューバッチへ反映してください。";
  };

  const save = async (id) => {
    if (!db) return;
    const row = ROWS.find((candidate) => candidate.id === id);
    const current = state.get(id);
    try {
      await db.doc(COLLECTION + "/" + id).set({
        n: row.n, pairId: row.pairId, kanji: row.kanji, word: row.word,
        decision: current.decision, note: current.note, updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      say("保存できませんでした（" + (error && error.code ? error.code : "不明") + "）。文面をコピーして会話へ貼ってください。", "warn");
    }
  };

  container.addEventListener("click", (event) => {
    const button = event.target.closest(".vote");
    if (!button) return;
    const id = button.closest(".row").dataset.id;
    const current = state.get(id);
    current.decision = current.decision === button.dataset.vote ? "pending" : button.dataset.vote;
    paint();
    save(id);
  });

  container.addEventListener("change", (event) => {
    const field = event.target.closest('[data-role="note"]');
    if (!field) return;
    const id = field.closest(".row").dataset.id;
    state.get(id).note = field.value;
    paint();
    save(id);
  });

  for (const chip of document.querySelectorAll("[data-filter]")) {
    chip.addEventListener("click", () => {
      filter = chip.dataset.filter;
      for (const other of document.querySelectorAll("[data-filter]")) {
        other.setAttribute("aria-pressed", String(other === chip));
      }
      paint();
    });
  }

  document.querySelector('[data-action="all-ok"]').addEventListener("click", () => {
    const targets = ROWS.filter((row) => state.get(row.id).decision === "pending");
    if (!targets.length) { say("未判断はありません。"); return; }
    if (!window.confirm("未判断の" + targets.length + "件をすべてOKにします。よろしいですか。")) return;
    for (const row of targets) { state.get(row.id).decision = "approve"; }
    paint();
    for (const row of targets) save(row.id);
    say("未判断の" + targets.length + "件をOKにしました。");
  });

  document.querySelector('[data-action="copy"]').addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(summaryBox.textContent); say("コピーしました。会話へ貼ってください。"); }
    catch { say("コピーできませんでした。文面を選んでコピーしてください。", "warn"); }
  });

  paint();

  // 判断の保存。Artifactの外で開いたときはwindow.claude自体が無いので、そこで止めない。
  const runtime = typeof window !== "undefined" && window.claude && typeof window.claude.use === "function"
    ? window.claude : null;
  if (!runtime) { say("この画面では判断を保存できません。文面をコピーして会話へ貼ってください。"); return; }
  runtime.use("db").then((store) => {
    if (!store) { say("この画面では判断を保存できません。文面をコピーして会話へ貼ってください。"); return; }
    db = store;
    store.collection(COLLECTION).onSnapshot((snapshot) => {
      let restored = 0;
      for (const saved of snapshot.docs) {
        const current = state.get(saved.id);
        if (!current) continue;
        const data = saved.data() || {};
        if (typeof data.decision === "string" && data.decision !== current.decision) { current.decision = data.decision; restored += 1; }
        if (typeof data.note === "string") current.note = data.note;
      }
      for (const row of ROWS) {
        const field = container.querySelector('[data-id="' + row.id + '"] [data-role="note"]');
        if (field && document.activeElement !== field) field.value = state.get(row.id).note;
      }
      paint();
      if (restored) say("保存されていた判断を" + restored + "件読みこみました。");
    }, (error) => { db = null; say("保存との接続が切れました（" + error.code + "）。文面をコピーして会話へ貼ってください。", "warn"); });
    say("判断は自動で保存されます。");
  });
})();
</script>
`;
}
