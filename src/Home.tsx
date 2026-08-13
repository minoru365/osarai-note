import { useEffect, useState } from "react";
import { getLocalDate } from "./dailySession";
import { studyStorage } from "./storage/indexedDb";

type Props = {
  questionCount: number;
  readingQuestionCount: number;
  writingQuestionCount: number;
  contentError: string;
  onStartKanji: (mode: "reading" | "writing") => void;
  onOpenFreePractice: () => void;
  onOpenKanjiSettings: () => void;
};

const SUBJECTS = [
  { icon: "字", name: "漢字", note: "3・4年生", ready: true },
  { icon: "単", name: "単位", note: "準備中", ready: false },
  { icon: "分", name: "分数", note: "準備中", ready: false },
  { icon: "地", name: "日本地図", note: "準備中", ready: false },
  { icon: "理", name: "理科", note: "準備中", ready: false },
];

type TodayProgress = { reading: { done: number; total: number }; writing: { done: number; total: number } };

export function Home({ questionCount, readingQuestionCount, writingQuestionCount, contentError, onStartKanji, onOpenFreePractice, onOpenKanjiSettings }: Props) {
  const canStart = questionCount > 0 && !contentError;
  const [today, setToday] = useState<TodayProgress>({
    reading: { done: 0, total: Math.min(10, readingQuestionCount) },
    writing: { done: 0, total: Math.min(10, writingQuestionCount) },
  });

  useEffect(() => {
    let active = true;
    void studyStorage.listDailySessions(getLocalDate()).then((sessions) => {
      if (!active) return;
      const summarize = (mode: "reading" | "writing", available: number) => {
        const modeSessions = sessions.filter((session) => session.mode === mode);
        const latest = modeSessions.sort((left, right) => left.batchNumber - right.batchNumber).at(-1);
        return latest
          ? { done: latest.currentIndex, total: latest.items.length }
          : { done: 0, total: Math.min(10, available) };
      };
      setToday({
        reading: summarize("reading", readingQuestionCount),
        writing: summarize("writing", writingQuestionCount),
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [readingQuestionCount, writingQuestionCount]);

  const hasProgress = today.reading.done > 0 || today.writing.done > 0;
  const startMode = today.reading.total > 0
    && today.reading.done >= today.reading.total
    && today.writing.done < today.writing.total
    ? "writing" as const
    : "reading" as const;

  return (
    <div className="app-shell home-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">学</span><span>おさらいノート</span></div>
        <div className="spike-label">おうちの復習</div>
        <button className="header-action" type="button" onClick={onOpenKanjiSettings}>保護者設定</button>
      </header>

      <main className="home-workspace">
        <section className="today-card">
          <div className="today-copy">
            <p className="eyebrow">今日の学習</p>
            <h1>まずは漢字から<br />やってみよう</h1>
            <p>読みと書きを、それぞれ自分のペースで練習できます。</p>
            <div className="today-progress" aria-label="今日の漢字学習の進み具合">
              <div><span>読み</span><strong>{today.reading.done} / {today.reading.total}問</strong></div>
              <div><span>書き</span><strong>{today.writing.done} / {today.writing.total}問</strong></div>
            </div>
            <button className="start-button" type="button" disabled={!canStart} onClick={() => onStartKanji(startMode)}>
              {contentError ? "問題を読み込めません" : questionCount > 0 ? hasProgress ? "今日のつづきから" : "今日の漢字をはじめる" : "問題を読み込み中…"}
              <span>→</span>
            </button>
            {contentError && <small className="home-error">{contentError}</small>}
          </div>
          <div className="today-visual" aria-hidden="true">
            <div className="notebook-page">
              <span>きょうも</span>
              <strong>できた！</strong>
              <div className="progress-stars">★ ★ ☆</div>
            </div>
          </div>
        </section>

        <section className="home-section">
          <div className="section-heading">
            <div><p className="eyebrow">教科から練習</p><h2>何を復習する？</h2></div>
            <div className="section-actions"><button type="button" disabled={!canStart} onClick={onOpenFreePractice}>問題を選んで自由練習</button><button type="button" onClick={onOpenKanjiSettings}>未習漢字を設定</button></div>
          </div>
          <div className="subject-grid">
            {SUBJECTS.map((subject) => (
              <button
                className={`subject-card ${subject.ready ? "ready" : ""}`}
                type="button"
                disabled={!subject.ready || !canStart}
                onClick={subject.ready ? () => onStartKanji(startMode) : undefined}
                key={subject.name}
              >
                <span className="subject-icon">{subject.icon}</span>
                <strong>{subject.name}</strong>
                <small>{subject.ready ? "読み・書きを練習" : subject.note}</small>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
