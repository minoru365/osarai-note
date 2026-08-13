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
