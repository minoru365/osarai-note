# 漢字問題データの基準資料

最終更新：2026-08-14

## 学年別漢字

- 文部科学省「小学校学習指導要領（平成29年告示）付録4 学年別漢字配当表」
- 用途：3年生200字、4年生202字の対象範囲と、例文中で使用できる学年相当漢字の検査
- 参照：https://www.mext.go.jp/content/1413522_001.pdf

## 常用漢字の音訓

- 文化庁「常用漢字（音訓）基本データ」
- 版：平成22年11月30日内閣告示対応
- 用途：各字の音読み・訓読みと語例の基準一覧
- 参照：https://www.bunka.go.jp/seisaku/bunkashingikai/kokugo/shoiinkai/iinkai_02/pdf/sanko_2.pdf
- 抽出物：`content-source/joyo-readings-2010.json`
- 再抽出：`scripts/extract-joyo-readings.py` に上記PDFと出力先を渡す

抽出物は候補作成と欠落検査に使う。PDFの表分割、注記、特別な読みを機械処理だけで確定せず、各問題素材を人が原本と照合して `approved` にする。

## 都道府県名の読み

- 文部科学省「小学校学習指導要領（平成29年告示）付録4 学年別漢字配当表」
- 用途：常用漢字表の音訓では読めない都道府県名の読みを、地名読みとして素材にする（[ADR-0011](./adr/0011-place-name-readings.md)）
- 参照：https://www.mext.go.jp/content/1413522_001.pdf
- 正本：`content-source/place-name-readings.json`

音訓で読める県名（香川の香、鹿児島の鹿など）はこの一覧に載せず、音訓基準一覧から素材を作る。この条件は `validatePlaceNameReference` が検査する。

## 語句読み候補

- 文化庁PDFの各音訓行にある語例を、記載順に候補化する。
- 学年配当外漢字を含まない語例を優先する。
- 熟語全体の読み候補にはJanome 0.5.0を使用する。
- 単一漢字と送り仮名だけの訓読みは、形態素解析より文化庁行の基準読みを優先する。
- 多義語など基準読みが解析結果に現れない候補は `manual-review` とし、素材へ自動追加しない。
- 候補一覧：`content-source/kanji-word-candidates.json`
