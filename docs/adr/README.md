# Architecture Decision Records

ADRは、後から理由を忘れると手戻りになる重要判断だけを記録する。日々の作業状況や小さなUI調整は対象外とする。

## 運用

1. `NNNN-short-title.md` の連番で作成する。
2. 状態は `Proposed`、`Accepted`、`Superseded` のいずれかとする。
3. 採用背景、決定、主な結果を短く記載する。
4. 決定を変更するときは既存ADRを書き換えず、新しいADRから `Supersedes` を示す。
5. 実装状況は [../progress.md](../progress.md) で管理する。

## 一覧

| ADR | 状態 | 決定 |
| --- | --- | --- |
| [0001](./0001-local-first-pwa.md) | Accepted | ローカルファーストPWAとGitHub Pages |
| [0002](./0002-kanji-level-scoring.md) | Accepted | 漢字単位の読み・書き集計 |
| [0003](./0003-daily-kanji-sessions.md) | Superseded | 読み・書き各10問の当日セッション |
| [0004](./0004-paired-question-generation.md) | Accepted | 共通素材から読み・書きペアを生成 |
| [0004b](./0004-practice-frequency-first.md) | Superseded | 今日の漢字は練習回数の少ない順にする |
| [0005](./0005-fresh-daily-practice.md) | Accepted | 「今日の漢字」は押すたびに新しく抽出する（出題順位はADR-0008が置き換え） |
| [0006](./0006-motivation-points-and-pet.md) | Accepted | 教科横断ポイントとペット育成 |
| [0007](./0007-multi-subject-data-model.md) | Accepted | 教科を追加するときの保存モデル |
| [0008](./0008-weak-slot-mixing.md) | Accepted | 出題の一部を苦手枠にあてる |
| [0009](./0009-shared-grade-selection.md) | Accepted | 学年選択を教科横断の保存設定にする |
| [0010](./0010-kanjivg-stroke-data.md) | Accepted | ストロークデータをKanjiVGへ移す |
| [0011](./0011-place-name-readings.md) | Accepted | 都道府県名の読みを地名読みとして扱う |

## テンプレート

```md
# ADR-NNNN: タイトル

- Status: Proposed
- Date: YYYY-MM-DD

## Context

判断が必要になった背景。

## Decision

採用する方針。

## Consequences

得られる利点、制約、必要になる作業。
```
