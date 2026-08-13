# StudySupport

小学4年生向け復習アプリの技術検証プロジェクトです。

現段階では、50音表を使った読み問題と、Hanzi Writer・日本語ストロークデータを使った一画ごとの書き順判定を検証できます。

読みの回答と書き問題の完了結果はブラウザ標準のIndexedDBへ保存します。学習データはサーバーへ送信せず、生の筆跡や筆圧は保存しません。

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

標準問題は `public/content/` に置きます。問題ファイルは上書きせず `kanji-v2.json` のように新しい名前で追加し、最後に `manifest.json` の `contentVersion` と参照先を更新します。画面コードの変更は不要です。

公開前に `npm test` と `npm run build` を実行し、問題IDの重複や問題形式の不備がないことを確認します。学習履歴、未習設定、カスタム問題はIndexedDBにあり、問題パックには含めません。

## GitHub Pages

`.github/workflows/pages.yml` はGitHub Pages用のテスト・ビルド・公開手順です。初期状態では手動実行だけにしてあり、pushだけでは公開されません。リポジトリ作成後、GitHubの `Settings > Pages` で公開元を `GitHub Actions` に設定してから、明示的にワークフローを実行します。
