type Props = {
  /** Shown above the choice, e.g. the kanji picked in がんばり記録. */
  subject?: string;
  readingCount: number;
  writingCount: number;
  onChoose: (mode: "reading" | "writing") => void;
  onBack: () => void;
};

/**
 * Asks which kanji form to practise before a batch starts. Replaces the old
 * reading/writing tabs in the practice header, so the choice is made once and
 * a running batch cannot be switched out from under the child.
 */
export function KanjiModeChoice({ subject, readingCount, writingCount, onChoose, onBack }: Props) {
  return (
    <div className="app-shell mode-choice-shell">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={onBack}>
          <span className="brand-mark">学</span><span>おさらいノート</span>
        </button>
        <div className="spike-label">漢字</div>
        <button className="header-action" type="button" onClick={onBack}>ホームへ戻る</button>
      </header>
      <main className="mode-choice-workspace">
        <div className="mode-choice-card">
          <p className="eyebrow">{subject ? `「${subject}」の練習` : "今日の漢字"}</p>
          <h1>どっちを練習する？</h1>
          <div className="mode-choice-row">
            <button
              className="mode-choice-button"
              type="button"
              disabled={readingCount === 0}
              onClick={() => onChoose("reading")}
            >
              <span className="mode-choice-icon" aria-hidden="true">読</span>
              <strong>読み</strong>
              <small>{readingCount === 0 ? "問題がありません" : "文の中の漢字を ひらがなで書く"}</small>
            </button>
            <button
              className="mode-choice-button"
              type="button"
              disabled={writingCount === 0}
              onClick={() => onChoose("writing")}
            >
              <span className="mode-choice-icon" aria-hidden="true">書</span>
              <strong>書き</strong>
              <small>{writingCount === 0 ? "問題がありません" : "ひらがなの ところを漢字で書く"}</small>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
