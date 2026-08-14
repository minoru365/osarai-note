# おさらいノート

小学4年生向け復習アプリの技術検証プロジェクトです。

現段階では、50音表を使った読み問題と、Hanzi Writer・日本語ストロークデータを使った一画ごとの書き順判定を検証できます。

読みの回答と書き問題の完了結果はブラウザ標準のIndexedDBへ保存します。学習データはサーバーへ送信せず、生の筆跡や筆圧は保存しません。

## ドキュメント

- AI開発ツールの入口：Codex等は [AGENTS.md](./AGENTS.md)、Claude Codeは [CLAUDE.md](./CLAUDE.md)、GitHub Copilotは [.github/copilot-instructions.md](./.github/copilot-instructions.md)
- [開発計画](./docs/study-support-plan.md)：今後の仕様、制約、ロードマップ
- [進捗](./docs/progress.md)：現在地、完了、次の作業、検証結果
- [引き継ぎ](./docs/handoff.md)：別セッション・別担当向けの現在地、再開手順、注意事項
- [ADR](./docs/adr/)：重要な設計判断と採用理由
- [IndexedDB v2設計](./docs/db-v2-design.md)：移行、状態遷移、原子的保存の受け入れ条件
- [問題生成の実装境界](./docs/content-generation-design.md)：素材状態、公開条件、機械ゲート
- [自由練習の保存境界](./docs/free-practice-design.md)：未履修除外、回答保存、当日セットとの分離
- [漢字問題の基準資料](./docs/kanji-data-sources.md)：学年配当と常用漢字音訓の出典・版

## 起動

```powershell
npm install
npm run dev
```

表示されたURLをChromeで開きます。Xiaomi Pad 6で確認するときは、PCとタブレットを同じネットワークへ接続し、開発PCのローカルIPアドレスを使います。

## 検証できる操作

- 文中の漢字の読みを、ひらがなの50音表から入力
- 小文字、濁音、半濁音、一字削除、全削除
- 誤答後の再回答と、正解後の次問題への進行
- 上部タブによる読み／書き問題の切り替え
- 「葉」の一文字練習
- 「植物」を一字ずつ練習
- 一画ごとの正誤判定
- ミス回数とヒント
- 「分からない」から書き順見本を確認して再練習
- 3年生200字・4年生202字の履修設定
- 未習漢字の個別チェック、絞り込み、一括変更、端末内保存

## 確認コマンド

```powershell
npm run build
npm test
npm audit
```

第三者ライブラリとデータの扱いは [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) を参照してください。

## 問題パックの更新

共通素材は `content-source/kanji-materials.json` で管理します。編集後に `npm run content:generate` を実行すると、確認済み素材だけから `public/content/kanji-v2.json` とレビュー・カバレッジ表が生成されます。

同時に、承認済みの書き問題で必要な日本語ストロークデータだけを `src/generated/kanjiCharacterData.ts` へ生成します。必要な字形データがライブラリにない場合は問題パックの更新を停止します。

文化庁語例から候補を再作成するときは、`requirements-content.txt` を導入して `scripts/build-kanji-word-candidates.py` を実行します。`scripts/seed-kanji-materials.py` は既存素材を上書きせず、読み照合済み候補だけを `draft` として追加します。Janomeの読みは候補専用で、人が確認するまで公開されません。

3年生の未確認素材から100件のレビュー票を作る場合は `npm run content:review-batch -- 3 7 100`、編集後の一覧を再描画する場合は `npm run content:review-render -- kanji-g3-007` を使います。レビュー票を作っただけでは問題は公開されません。

バッチJSONから対話型の確認画面を作る場合は `npm run content:review-visualize -- kanji-g3-007 <出力先HTMLの絶対パス>` を使います。この画面からの判定送信は、Codex会話内のVisualizeとして表示した場合だけ利用できます。

判断済みの票は `npm run content:review-apply -- kanji-g3-007 2026.08.14-9` のように新しい素材版を指定して取り込みます。未判断項目、古い票、不正な状態遷移がある場合は素材を変更せず停止します。

公開前に `npm test` と `npm run build` を実行し、問題IDの重複、読み書きペア、学年配当、ひらがな回答を確認します。学習履歴、未習設定、カスタム問題はIndexedDBにあり、問題パックには含めません。

## GitHub Pages

`.github/workflows/pages.yml` はGitHub Pages用のテスト・ビルド・公開手順です。初期状態では手動実行だけにしてあり、pushだけでは公開されません。リポジトリ作成後、GitHubの `Settings > Pages` で公開元を `GitHub Actions` に設定してから、明示的にワークフローを実行します。
