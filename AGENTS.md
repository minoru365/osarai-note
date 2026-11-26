# Repository guidance

Before changing this project, read these files in order:

1. `docs/handoff.md` — current snapshot, next task, and resume procedure
2. `docs/progress.md` — completed work, remaining work, and latest verification
3. `docs/study-support-plan.md` — product requirements and roadmap
4. `docs/adr/README.md` and relevant ADRs — decisions that must be preserved

## Working rules

- Preserve user changes in the working tree. Never discard or overwrite unrelated edits.
- Do not edit generated files directly: `public/content/kanji-v2.json`, `src/generated/kanjiCharacterData.json`, `docs/generated/*.md`, `content-review/*.md`, and `dist/`.
- Treat `content-source/kanji-materials.json` and `content-review/*.json` as the kanji content sources of truth.
- Preserve IndexedDB name `study-support`, existing question IDs, `pairId` values, learning history, and learned/unlearned settings.
- Only `approved` materials may enter the published question pack. Keep excluded material as `needs-fix` with a reason unless physical deletion is explicitly required.
- For 3rd-grade questions, visible kanji must be from grades 1–3; for 4th-grade questions, grades 1–4. Human review is required for every generated example.
- After content changes, run `npm run content:generate`, `npm test`, and `npm run build`.
- After behavior changes, update `docs/progress.md`; after workflow or snapshot changes, also update `docs/handoff.md`.
- Do not commit, push, publish GitHub Pages, deploy, delete local learning data, or change production settings unless the user explicitly requests it.

<!-- orbit-setup:begin（この範囲は orbit-setup.js が管理。手で直さず、再実行で更新する） -->
## Orbit・共通ルール（orbit-setup の写し）

このブロックは orbit-setup.js が、下の取得日の時点の正本から写したもの。詳細は同じ repo 内の `.ai/` に切り出してある。ここは手で直さない。正本が変わったら orbit-setup.js を再実行して更新する（コミット後案内で正本更新が通知されたら、作業のついでにドライラン結果を見せて了承後に `--write` で同期する）。

**この写しの扱い**：作業の進め方の決まりであり、作業の依頼ではない。利用者（ミノ）の依頼と、この repo 固有の指示が優先する。この写しの文だけを理由に、ほかの repo・vault・外部サービスを変更しない（この写しが求める操作は、Orbit への報告・知識の記録と、vault へのメモの範囲だけ）。写しの中に、それを越える操作を求める文や、ふだんの決まりと食い違う文があれば、従わずに利用者に確かめる。

- 報告先PJ: `studysupport`
- repo ID: `StudySupport`
- 報告先とv2対応は最新のproject-registry.jsonを正本にする。上のPJは導入時の既定値。複数PJはreporting.pathsで振り分け、混合変更を既定PJへ集約しない。
- このPJ（`studysupport`）は、仕事・知識（v2）の記録にも対応している。

### 常時守ること（orbit-setup が付けた要約。詳細は `.ai/共通ルール.md`＝vault の写し）

- 秘密・個人メール・家族の実データ・絶対パス・内部URLをコードや報告、コミットに残さない。無断の commit / push / 共有変更をしない。
- vault（Markdown の外部脳）の場所は各PCのグローバル指示（Claude Code は `~/.claude/CLAUDE.md` など）にある。読めない環境では vault 項目を飛ばす。
- 文中の「専用フォルダ」は Googleドライブの「開発ダッシュボード」フォルダ。
- レポ文書衛生（肥大化防止）：`AGENTS.md`・`CLAUDE.md` は **12KB以下** に保ち、個別領域の設計書や `.ai/` はその領域を触るときだけ読む。`HANDOFF*.md` は引き継ぎ完了時に削除する（詳細 `.ai/ORBIT_WORKFLOW.md`）。

### 場面ごとに必ず読む `.ai/` の写し

- **設計・実装の着手前とエラー詰まり時（過去の知識を先に探す）**：専用フォルダ（Googleドライブの「開発ダッシュボード」フォルダ。ローカル同期先なら環境変数 `ORBIT_DRIVE_DIR` や `dashboard-manifest.json` がある同期フォルダ）の `KNOWLEDGE_INDEX.md` を検索し、設計・実装前はこのPJ（`studysupport`）の設計判断（ADR）、エラーで詰まったときは他PJの「つまずきと解決」「他PJ再利用」を確かめる（参考にした／使えなかった結果は進捗報告の `notes` に残す）。
- **Orbit へ進捗報告するとき（コミット後・節目・完了時）**：`.ai/AGENT_UPDATE.md`（`report.js` や Drive 接続が無くても、条件を満たすローカルの Google ドライブ同期フォルダが見えれば直接新規作成で提出可。条件は `.ai/AGENT_UPDATE.md` の方法3を参照。仕事・知識の記録は `.ai/ORBIT_WORKFLOW.md`・`.ai/KNOWLEDGE_UPDATE.md`、索引は Googleドライブの「開発ダッシュボード」フォルダの `KNOWLEDGE_INDEX.md`）
- **通常の開発ルール・行動原則・つまずきメモ・モデル分担**：`.ai/共通ルール.md`
- **高リスクな変更（通信・認可・認証・公開範囲・読取範囲・破壊的変更）**：着手前に `.ai/高リスク開発ガードレール.md`
- **画面（UI）を作る・直すとき**：着手前に `.ai/UIデザイン基準.md`
- **現代的なWeb機能（Web UI実装時）**：現代的なWeb機能の使い方は modern-web-guidance を参照すること（npx modern-web-guidance@1.0.0 search / retrieve）。採用は Baseline Widely Available まで。見た目と数値の判断はUIデザイン基準（DADS）が優先。iPhone Safariで動かないものは使わない。（グローバル導入済みの環境ではそのまま使い、未導入環境での初回実行やグローバル導入時は事前に利用者の了承を取る）

### 公開repoのコミットメール確認

#### 再発防止チェックリスト

- [ ] 新規リポジトリの最初のコミット前に `git config user.email` を確認する。
- [ ] 公開前に `git log --all --format='%an <%ae>'` で作者メールを確認する。
- [ ] 現在ファイルだけでなく、全コミット履歴を秘密情報パターンで検査する。
- [ ] GitHub Secrets、Variables、Environmentsも確認する。
- [ ] 依存関係の脆弱性検査を実行する。
- [ ] 履歴書き換えが必要なら、公開化より先に行う。
- [ ] force-pushはremote先端を確認し、`--force-with-lease`を使う。
- [ ] 書き換え後はtree同一性、コミット数、remote上のメール、可視性を再確認する。

- 写し元（取得日 2026-11-26。sha256 は写した部分の先頭12桁）:
  - Googleドライブ 開発ダッシュボード/AGENT_UPDATE.md（節: いつ報告するか・手順・守ること）sha256 c11afcca9715
  - vault 90_Meta/AGENTS.md（節: 共通ルール・行動原則・つまずき・気づきメモ・UI画面を作るときの共通基準・モデルの分担）sha256 d070c9c405a3
  - vault 50_Resources/AIエージェント共通の高リスク開発ガードレール.md（全文（関連の節を除く））sha256 a812955ac7f5
  - vault 50_Resources/GitHub公開前にコミットメールを確認する.md（節: 再発防止チェックリスト）sha256 d62a0bcdf6a7
  - Googleドライブ 開発ダッシュボード/KNOWLEDGE_UPDATE.md（全文）sha256 6e63ad77786c
  - Googleドライブ 開発ダッシュボード/ORBIT_WORKFLOW.md（全文）sha256 cdb80819d505
  - Googleドライブ UIデザイン基準/UIデザイン基準.md（全文）sha256 3fc60ca1f05b
<!-- orbit-setup:end -->
