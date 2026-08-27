# KanjiVG（取り込み）

このディレクトリは [KanjiVG](https://kanjivg.tagaini.net) のリリース
`r20250816`（`kanjivg-20250816-main.zip`）から、問題パックに必要な368字分の
SVG だけを取り込んだものである。ファイル名は文字のコードポイント（5桁の16進）。

- 著作者：Ulrich Apel
- ライセンス：[Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/)

各 SVG の先頭コメントに権利表示の原文が入っている。**削除しないこと。**

## 扱い

- **手で編集しない。** 書き順や字形を直す必要があるときは、上流の KanjiVG へ
  報告するか、生成スクリプト側で対処する。
- ここから `src/generated/kanjiCharacterData.ts` を生成する
  （`npm run content:generate`）。生成物も CC BY-SA 3.0 の派生物である。
- 字を追加するときは、同じリリースから該当するコードポイントの SVG を
  取り込み、[THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md) の記述と
  齟齬が出ていないか確認する。

判断の背景は [ADR-0010](../../docs/adr/0010-kanjivg-stroke-data.md) にある。
