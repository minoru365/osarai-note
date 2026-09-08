# おさらいノート 引き継ぎ

最終更新：2026-09-08

この文書は、別セッションまたは別の開発担当が作業を再開するための入口である。将来仕様は [study-support-plan.md](./study-support-plan.md)、実装状況は [progress.md](./progress.md)、設計理由は [adr/](./adr/) を正本とする。

## AIツール別の入口

| ツール | 自動読込される入口 | 正本への経路 |
|---|---|---|
| Claude Code | ルートの `CLAUDE.md` | `CLAUDE.md` → `AGENTS.md` → この文書・進捗・計画・ADR |
| GitHub Copilot | `.github/copilot-instructions.md`、対応環境では`AGENTS.md` | Copilot instructions → `AGENTS.md` → この文書・進捗・計画・ADR |
| Codex・その他のエージェント | ルートの `AGENTS.md` | `AGENTS.md` → この文書・進捗・計画・ADR |

変動する件数と最新の検証結果は `progress.md` に記録する。次に行う作業と再開手順はこの文書で管理し、各AIツール用の入口には値を複製せず、正本への読み順だけを置く。

## 1. 再開時の確認

- 現在の実装状況、件数、残件、最新の検証結果は [progress.md](./progress.md) を確認する。
- 将来仕様は [study-support-plan.md](./study-support-plan.md)、設計判断は [adr/](./adr/) を確認する。
- 作業開始時は必ず `git status --short` で利用者の変更を確認し、既存変更を破棄しない。
- ローカルで検証できない場合は、`main` へのpushで走るPagesワークフローの結果を確認する。

## 2. 固定済みの製品方針

- Xiaomi Pad 6の横向き固定。一般的なレスポンシブ対応は行わない。
- Android Chromeで動くローカルファーストPWA。配信先はGitHub Pages。
- 初期版は単一端末・単一利用者。アカウント、クラウド同期、Azureは使わない。
- 学習履歴と設定はIndexedDB `study-support` に保存し、問題更新やPWA更新で消去しない。
- 3・4年生の漢字を対象とし、読みと書きを同じ共通素材から1問ずつ生成する。
- 未履修漢字を1字でも含む問題は、今日の学習と自由練習のどちらにも出さない。
- 読みは文中の漢字部分だけをひらがなで回答する。カタカナ、長音、小さい「ゎ」は使わない。
- 書きは複数字でも一字ずつ書き順判定し、正解まで先へ進めない。「分からない」は見本確認後に再回答する。
- 読みの誤答は `targetKanji` 全字、書きは間違えた文字だけの苦手度へ反映する。
- 「今日の漢字」は押すたびに練習回数の少ない順、同数ランダムで最大10問を新規抽出する。未完了セットは再開しない。
- 自由練習は学年ランダム最大10問、または漢字を選んで関連最大10問を直接開始する。

## 3. 実装済み内容の参照先

実装済みの内容を時系列で追う必要がある場合は [progress.md](./progress.md) の完了・検証記録とGit履歴を参照する。ここでは同じ内容を再掲せず、次に行う作業と再開手順を管理する。

## 4. 次に行う作業

### 4.0 ローカル環境の確認

Node.js 22以上を用意し、次の順に実行する。テスト・ビルドの最新結果は [progress.md](./progress.md) に記録する。

```powershell
npm ci
npm test
npm run build
```

型チェックは `npx tsc --noEmit` ではなく、`npm run build` または `npx tsc -p tsconfig.app.json --noEmit` を使う。大文字小文字だけが異なるファイル名は作らない。

### 4.1 モチベーション機能（ペット）の積み残し

仕様は [study-support-plan.md](./study-support-plan.md) 8章、判断理由は [ADR-0006](./adr/0006-motivation-points-and-pet.md) と [ADR-0012](./adr/0012-motivation-fairness-and-fantasy-progression.md)。データ層とホーム常駐UI、がんばり記録への一覧、3職種の段階別素材は実装済みで、残りは次のとおり。

1. **実画面での確認（一部完了）**。エサ1/3/5ポイントの消費と「ありがとう！」の表示、残高0のときに何も起きないことは2026-08-26に確認済み。**未確認は、装備が段階ごとに変化すること、3日放置後の種別ごとの待機表情と正解後の回復、旧2匹完了状態からのきつね解放、3匹完了後の表示。** 通常操作では各500ポイントまたは72時間を要するため、学習データを壊さない開発用確認手順が必要である。
3. **JSONバックアップ・復元・初期化への組み込み**。ポイント残高とペット状態を対象に含めることはADR-0006で決めているが、バックアップ機能自体がM3で未実装のため、実装時に忘れずに含める。
4. **4種類目以降の体験**は未定。現在は3種類目までで完了し、「3ひきとも さいだいまで そだてたよ！」で止まる。追加する場合は固定順の末尾へ種類・役割・素材を足し、後方互換を再確認する。

教科を追加するときは、ポイント加算が各教科の保存経路の中にあるため、書き忘れると「完了した問題だけ1ポイント」が黙って崩れる（ADR-0007/0012）。がんばり記録とホームの当日進捗への反映も同じチェックリストに含まれる。

### 4.2 問題レビューの反映完了と残件

4年生の一括レビューは完了した。`kanji-g4-all` の220件をすべて承認し、素材版 `2026.09.08-1` と公開問題へ反映済みである。初期候補に残っていた「教科書に『〜』と書いてあります。」型218件も修正済みである。

1. レビュー結果の正本は `content-review/kanji-g4-all.json`。220件すべて `approve` として反映済み。
2. 残りの4年生 `needs-fix` 19件は、代替語を見つけたら同じ手順で再レビューする。
3. 未作成の6件（成・清・静・仲・富・牧）は、自然な語句が見つかるか個別に判断する。

3年生は未確認素材と未作成素材がなくなり、残りは `needs-fix` 35件だけになった。4年生の残りは25件（`needs-fix` 19件、素材未作成6件）で、全体の残りは60件。追加した18件には、茨城・岡山・埼玉・長崎・新潟・岐阜・兵庫・栃木などの地名候補が含まれる。地名読みで追加した滋賀・大阪・愛媛・富山の4件も承認済みである（[ADR-0011](./adr/0011-place-name-readings.md)）。

### 4.3 日本地図初版の確認

1. `content-source/japan-map-questions.json` の47問を人が確認する
2. ブラウザで地図のクリック判定、拡大・縮小・リセット、ピンチ・ドラッグ操作、誤答後の再回答、「分からない」後の答え確認、10問完走、ホームの当日進捗を確認する
3. 地方区分、形、都道府県名から位置を選ぶ双方向問題は、初版の確認後に追加する

**バッチを承認する前に、KanjiVGのストロークデータを取り込むこと。** `content-source/kanjivg/` には現在の承認済み問題に必要な532字を収録済み。不足したまま承認すると `npm run content:generate` が「承認済み問題のKanjiVGデータがありません」で止まるため、次回の承認でも生成前に不足字を確認する。

手順は、KanjiVGをリリース`r20250816`で取得し、必要な字の`kanji/<5桁の16進コードポイント>.svg`を`content-source/kanjivg/`へ複製する（[ADR-0010](./adr/0010-kanjivg-stroke-data.md)）。

```powershell
git clone --depth 1 --branch r20250816 https://github.com/KanjiVG/kanjivg <作業用パス>\kanjivg
```

リモート作業環境ではraw.githubusercontent.comへの直接接続がネットワーク方針で拒否されるが、git proxyが公開リポジトリの匿名cloneを通すため、この方法なら取り込める。取り込み後は既存ファイルとの一致を確認するとよい（2026-09-03時点で、既存368字は`r20250816`とバイト一致した）。

問題レビューと並行しない次の技術課題は、ストロークJSONの増加でViteの生成JavaScriptが500KBを超えた警告への対応である。現在は532字収録で2,644.45KB（gzip 1,015.36KB）まで増えたが動作するため、レビューを止める問題ではない。対応時はストロークデータの遅延読み込みまたは静的JSON分離を検討し、オフライン動作とGitHub Pagesのパスを検証する。

## 5. 問題レビュー手順

### 5.1 バッチ作成

```powershell
npm run content:review-batch -- 4 3 100
```

生成される正本は `content-review/kanji-g4-003.json`。Markdownは確認用生成物であり、JSON編集後に再生成する。

4年生の未確認素材を一括で確認する場合は次を使う。

```powershell
npm run content:review-all -- 4
npm run content:review-page -- kanji-g4-all <書き込み可能な絶対パス>\kanji-g4-all-review.html
```

正本は `content-review/kanji-g4-all.json`。220件すべてを `approve` として反映済み。

### 5.2 例文編集の規則

- `promptBefore + word + promptAfter` が自然な一文になるようにする。
- 読みと書きで同じ例文を使う。
- 正解漢字を文脈の別の場所へ重ねて表示し、答えを露出させない。
- `wordReading` はひらがなだけにする。
- 送り仮名を含む場合、漢字に対応する読みだけが回答になることを確認する。
- 3年生では1〜3年生、4年生では1〜4年生までの配当漢字だけを表示する。
- 都道府県名に使われる漢字は、基準読みに合う限り県名を優先して採用する（例：香→香川、鹿→鹿児島、奈→奈良、兵→兵庫）。4年生にこれらの字が配当されているのは県名のためであり、文化庁語例から自動で選ばれる語（奈落、兵器、徳用など）より児童に適する。例外は[content-generation-design.md](./content-generation-design.md)を見る。
- 生成AIの案は自動承認せず、必ず人が自然さと意味を確認する。

### 5.3 Markdownと確認画面

```powershell
npm run content:review-render -- kanji-g4-003
npm run content:review-visualize -- kanji-g4-003 <書き込み可能な絶対パス>\kanji-review-g4-batch-003.html
```

`content:review-visualize` は、問題一覧、全部OK、個別の要修正、Codexへの判定送信を含むHTML断片を作る。判定送信はCodex会話内のVisualizeとして表示したときだけ機能する。単独の`file://`タブでは会話ブリッジがないため、送信結果を会話へ渡せない。

Claude Codeで作業する場合は `content:review-page` を使う。

```powershell
npm run content:review-page -- kanji-g4-003 <書き込み可能な絶対パス>\kanji-g4-003-review.html
```

こちらは単体で開ける確認ページを作る。読み問題と書き問題の両方の見え方、答え、書く字を1行にまとめ、送り仮名を分離できない語句には警告を出す。出力はClaudeのArtifactの本文としてそのまま公開でき、公開時に `capabilities: {db: {}}` を付けると判断がArtifactのデータベースへ保存され、会話側から `read_db`（コレクション `reviews/<バッチID>/entries`、文書IDは3桁の連番）で読み取れる。保存が使えない環境では、貼り付け用の文面を画面下に出す。どちらの画面も、行のHTMLを手で作らずバッチJSONから決定的に生成する。

### 5.4 判断反映

- 承認：`decision: "approve"`
- 除外・再検討：`decision: "needs-fix"` と具体的な `note`
- 未判断が1件でもあれば取り込みは停止する。
- 「削除」の要望は、通常は物理削除せず `needs-fix` で公開対象から除外し、判断履歴を保持する。

```powershell
npm run content:review-render -- kanji-g4-003
npm run content:review-apply -- kanji-g4-003 2026.08.15-6
npm run content:generate
npm test
npm run build
```

`content:review-apply` は素材版、元データ指紋、状態遷移、全提案を検査してから正本を置き換える。失敗時に版だけを変えたり、生成ファイルを手編集して回避しない。

## 6. 編集するファイルと生成物

| 目的 | 正本・編集対象 | 直接編集しない生成物 |
|---|---|---|
| 問題素材 | `content-source/kanji-materials.json`、`content-review/*.json` | `public/content/kanji-v2.json` |
| 読みの基準 | `content-source/joyo-readings-2010.json`、`content-source/place-name-readings.json` | `docs/generated/kanji-reading-coverage.md` |
| ストローク収録 | `scripts/generate-kanji-character-data.mjs` と素材 | `src/generated/kanjiCharacterData.ts` |
| レビュー文書 | バッチJSON | `content-review/*.md`、`docs/generated/*.md` |
| 学習画面 | `src/App.tsx`、`src/ReadingPractice.tsx`、`src/styles.css` | `dist/` |
| 保存層 | `src/storage/` | ブラウザ内IndexedDB |

主要スクリプト：

- `scripts/create-kanji-review-batch.mjs`
- `scripts/create-kanji-review-workset.mjs`
- `scripts/render-kanji-review-batch.mjs`
- `scripts/render-kanji-review-visualization.mjs`
- `scripts/apply-kanji-review-batch.mjs`
- `scripts/generate-kanji-content.mjs`
- `scripts/kanji-content-lib.mjs`

## 7. 起動と検証

```powershell
npm install
npm test
npm run build
npm run dev
```

`npm run dev` はLAN公開を有効にしている。Xiaomi Pad 6とPCを同じネットワークへ接続し、開発PCの現在のIPv4アドレスとViteのポートを使う。IPアドレスは固定値として文書やコードへ埋め込まない。

最低限の実画面確認：

1. ホームから今日の漢字を開始できる。
2. 読みの強調範囲と回答範囲が漢字部分だけになっている。
3. 読みの「分からない」後、答えを隠して正解入力まで進めない。
4. 書き枠、入力領域、SVGがそれぞれ`474px`、`470px`、`470px`になっている。
5. 複数字を一字ずつ書ける。
6. 未履修漢字を含む問題が今日の学習と自由練習に出ない。
7. 回答後に再読み込みしても履歴と苦手度が残る。

## 8. データ安全上の注意

- IndexedDBの削除、初期化、復元、DB名変更を行わない。
- DBスキーマ変更では、既存履歴・履修設定・カスタム問題を保持する移行テストを先に作る。
- 回答保存は履歴、セッション進捗、漢字別集計を同じトランザクションで確定する。
- 問題IDと`pairId`を不用意に変更しない。既存学習履歴との参照を維持する。
- 問題パックへ学習履歴、氏名、端末情報、筆跡を含めない。
- GitHub Pagesの公開、コミット、push、デプロイは利用者から明示された場合だけ行う。

## 9. 文書更新ルール

- 仕様変更：`study-support-plan.md`
- 現在地、件数、検証結果：`progress.md`
- 後で理由を忘れる重要判断：新しいADR
- 再開手順と直近の注意：この文書
- 開発者向け入口：`README.md`

作業完了時は、素材版、承認・未確認件数、問題数、テスト数、ビルド警告、次のバッチIDをこの文書と `progress.md` でそろえる。
