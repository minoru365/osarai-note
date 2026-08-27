# サードパーティの権利表示

このアプリは、配信物（GitHub Pages で公開する JavaScript）の中に第三者の
データとソフトウェアを含んでいる。ここに出典とライセンスをまとめる。

リポジトリ自身のコードは MIT（[LICENSE](./LICENSE)）で、以下はその対象外である。

## 漢字のストロークデータ

**KanjiVG** — 書き順・字形データ

- 著作者：Ulrich Apel
- 出典：<https://kanjivg.tagaini.net>
- ライセンス：[Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/)

`content-source/kanjivg/` に取り込んだ SVG と、そこから生成する
`src/generated/kanjiCharacterData.ts` は、いずれも KanjiVG の派生物である。
**CC BY-SA 3.0 の継承条件により、これらは同じライセンスで配布する。**
再配布・改変する場合は、出典表示と同ライセンスでの公開が必要になる。

## 描画ライブラリ

**Hanzi Writer** 3.7.3

- 著作者：David Chanin
- 出典：<https://chanind.github.io/hanzi-writer>
- ライセンス：MIT

## その他の依存

React、React DOM、Vite、Vitest、jsdom、`@vitejs/plugin-react` は MIT。
TypeScript と fake-indexeddb は Apache License 2.0。いずれも許諾型で、
各パッケージの `node_modules/<name>/LICENSE` に全文がある。

## 過去に使用したデータ

**`@jamsch/hanzi-writer-data-jp`** 0.0.3（2026-08-27 に KanjiVG へ置き換え）

- 出典：animCJK および Make Me a Hanzi
- 元データ：Arphic Technology のフォント
- ライセンス：Arphic Public License、および LGPL（animCJK 分）

置き換えの理由は [ADR-0010](./docs/adr/0010-kanjivg-stroke-data.md) に記録している。
