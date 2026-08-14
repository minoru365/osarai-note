function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function scriptJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function createReviewVisualization(batch) {
  assert(batch?.schemaVersion === 1 && typeof batch.batchId === "string", "レビューバッチの形式が不正です");
  assert((batch.grade === 3 || batch.grade === 4) && Array.isArray(batch.entries) && batch.entries.length > 0,
    "レビュー項目がありません");

  const rows = batch.entries.map((entry, index) => ({
    n: index + 1,
    id: entry.pairId,
    kanji: entry.primaryKanji,
    type: entry.readingType === "on" ? "音" : "訓",
    base: entry.canonicalReading,
    word: entry.proposed.word,
    reading: entry.proposed.wordReading,
    before: entry.proposed.promptBefore,
    after: entry.proposed.promptAfter,
    decision: entry.decision,
    note: entry.note ?? "",
  }));
  const rootId = `kanji-review-${batch.batchId.replaceAll(/[^a-zA-Z0-9_-]/gu, "-")}`;
  const count = rows.length;

  return `<div id="${rootId}">
  <div class="viz-row kr-head">
    <div>
      <h2>${batch.grade}年生・${count}問</h2>
      <div class="text-small text-muted">自然な例文案と、回答する語句を確認してください。</div>
    </div>
    <span class="viz-badge kr-count">未判断 ${count}件</span>
  </div>
  <div class="table-responsive">
    <table class="table table-sm">
      <thead><tr><th class="text-end">#</th><th>漢字・読み</th><th>語句</th><th>例文案</th><th>判断</th><th>メモ</th></tr></thead>
      <tbody class="kr-body"></tbody>
    </table>
  </div>
  <div class="viz-controls">
    <button class="btn kr-all-ok" type="button">全部OK</button>
    <button class="btn btn-primary kr-send" type="button">判定を送る</button>
    <span class="text-small text-muted kr-message" aria-live="polite"></span>
  </div>
</div>

<style>
  #${rootId} { display: grid; gap: 16px; color: var(--foreground); }
  #${rootId} .kr-head { justify-content: space-between; align-items: flex-end; }
  #${rootId} td { vertical-align: middle; }
  #${rootId} .kr-reading { display: grid; gap: 2px; min-width: 86px; }
  #${rootId} .kr-sentence { min-width: 260px; }
  #${rootId} .kr-sentence mark { color: var(--foreground); background: color-mix(in srgb, var(--yellow) 25%, transparent); }
  #${rootId} .kr-decision { min-width: 112px; }
  #${rootId} .kr-note { min-width: 150px; }
</style>

<script>
(() => {
  const root = document.getElementById(${scriptJson(rootId)});
  const batchId = ${scriptJson(batch.batchId)};
  const rows = ${scriptJson(rows)};
  const body = root.querySelector('.kr-body');
  const count = root.querySelector('.kr-count');
  const message = root.querySelector('.kr-message');
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  body.innerHTML = rows.map(row => \`<tr data-id="\${esc(row.id)}">
    <td class="text-end">\${row.n}</td>
    <td><div class="kr-reading"><strong>\${esc(row.kanji)}・\${esc(row.type)}</strong><span class="text-small text-muted">\${esc(row.base)}</span></div></td>
    <td><strong>\${esc(row.word)}</strong><div class="text-small text-muted">\${esc(row.reading)}</div></td>
    <td class="kr-sentence">\${esc(row.before)}<mark>【\${esc(row.word)}】</mark>\${esc(row.after)}</td>
    <td><select class="form-select kr-decision" aria-label="\${row.n}番の判断"><option value="pending">未判断</option><option value="approve">OK</option><option value="needs-fix">要修正</option></select></td>
    <td><input class="form-control kr-note" aria-label="\${row.n}番のメモ" placeholder="修正内容" value="\${esc(row.note)}"></td>
  </tr>\`).join('');
  rows.forEach(row => {
    root.querySelector(\`tr[data-id="\${row.id}"] .kr-decision\`).value = row.decision;
  });
  const update = () => {
    const decisions = [...root.querySelectorAll('.kr-decision')].map(element => element.value);
    const pending = decisions.filter(value => value === 'pending').length;
    const fixes = decisions.filter(value => value === 'needs-fix').length;
    count.textContent = pending ? \`未判断 \${pending}件\` : fixes ? \`要修正 \${fixes}件\` : \`${count}件すべてOK\`;
  };
  root.querySelectorAll('.kr-decision').forEach(element => element.addEventListener('change', update));
  root.querySelector('.kr-all-ok').addEventListener('click', () => {
    root.querySelectorAll('.kr-decision').forEach(element => { element.value = 'approve'; });
    update();
    message.textContent = '全件をOKにしました。内容を確認して判定を送ってください。';
  });
  root.querySelector('.kr-send').addEventListener('click', async () => {
    const results = rows.map(row => {
      const tr = root.querySelector(\`tr[data-id="\${row.id}"]\`);
      return { n: row.n, decision: tr.querySelector('.kr-decision').value, note: tr.querySelector('.kr-note').value.trim() };
    });
    const pending = results.filter(row => row.decision === 'pending');
    if (pending.length) { message.textContent = \`未判断が\${pending.length}件あります。\`; return; }
    const approved = results.filter(row => row.decision === 'approve').map(row => row.n).join(', ');
    const fixes = results.filter(row => row.decision === 'needs-fix').map(row => \`#\${row.n} \${row.note || '要修正'}\`).join('\\n');
    const prompt = \`\${batchId} のレビュー結果です。\\nOK: \${approved || 'なし'}\\n要修正:\\n\${fixes || 'なし'}\\n承認内容をレビューバッチへ反映してください。\`;
    message.textContent = '判定を送信します…';
    try {
      await window.openai.sendFollowUpMessage({ prompt, title: '漢字問題の判定を送る' });
    } catch {
      message.textContent = '送信できませんでした。会話に「全部OK」または「#番号 修正内容」を送ってください。';
    }
  });
  update();
})();
</script>
`;
}
