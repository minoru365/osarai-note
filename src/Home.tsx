import { useEffect, useState } from "react";
import { getLocalDate } from "./dailySession";
import { PetWidget } from "./PetWidget";
import { studyStorage } from "./storage/indexedDb";

type Props = {
  questionCount: number;
  readingQuestionCount: number;
  writingQuestionCount: number;
  contentError: string;
  onStartKanji: (mode: "reading" | "writing") => void;
  onOpenFreePractice: () => void;
  onOpenKanjiSettings: () => void;
  onOpenAchievements: () => void;
  unitQuestionCount: number;
  onStartUnits: () => void;
};

type Subject = {
  icon: string;
  name: string;
  note: string;
  ready: boolean;
  hint: string;
  start?: () => void;
};

type TodayProgress = { reading: number; writing: number; units: number };

function countCompleted(sessions: { items: { status: string }[] }[]): number {
  return sessions.reduce(
    (total, session) => total + session.items.filter((item) => item.status === "completed").length,
    0,
  );
}

export function Home({ questionCount, readingQuestionCount, writingQuestionCount, contentError, onStartKanji, onOpenFreePractice, onOpenKanjiSettings, onOpenAchievements, unitQuestionCount, onStartUnits }: Props) {
  const canStart = questionCount > 0 && !contentError;
  const [today, setToday] = useState<TodayProgress>({ reading: 0, writing: 0, units: 0 });

  useEffect(() => {
    let active = true;
    const localDate = getLocalDate();
    void Promise.all([
      studyStorage.listDailySessions(localDate, "kanji"),
      studyStorage.listDailySessions(localDate, "units"),
    ]).then(([kanjiSessions, unitSessions]) => {
      if (!active) return;
      setToday({
        reading: countCompleted(kanjiSessions.filter((session) => session.mode === "reading")),
        writing: countCompleted(kanjiSessions.filter((session) => session.mode === "writing")),
        units: countCompleted(unitSessions),
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [readingQuestionCount, writingQuestionCount, unitQuestionCount]);

  const startMode = today.reading <= today.writing ? "reading" as const : "writing" as const;

  const subjects: Subject[] = [
    {
      icon: "字", name: "漢字", note: "3・4年生", ready: canStart,
      hint: "読み・書きを練習", start: () => onStartKanji(startMode),
    },
    {
      icon: "単", name: "単位", note: "準備中", ready: unitQuestionCount > 0,
      hint: "長さ・重さ・かさ・時間・面積", start: onStartUnits,
    },
    { icon: "分", name: "分数", note: "準備中", ready: false, hint: "" },
    { icon: "地", name: "日本地図", note: "準備中", ready: false, hint: "" },
    { icon: "理", name: "理科", note: "準備中", ready: false, hint: "" },
  ];

  return (
    <div className="app-shell home-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">学</span><span>おさらいノート</span></div>
        <div className="spike-label">おうちの復習</div>
        <div className="header-nav">
          <button className="header-action" type="button" onClick={onOpenAchievements}>がんばり記録</button>
          <button className="header-action" type="button" onClick={onOpenKanjiSettings}>保護者設定</button>
        </div>
      </header>

      <main className="home-workspace">
        <section className="today-card">
          <div className="today-copy">
            <p className="eyebrow">今日の学習</p>
            <h1>まずは漢字から<br />やってみよう</h1>
            <p>読みと書きを、それぞれ自分のペースで練習できます。</p>
            <div className="today-progress" aria-label="今日の漢字学習の進み具合">
              <div><span>読み</span><strong>{today.reading}問</strong></div>
              <div><span>書き</span><strong>{today.writing}問</strong></div>
              {unitQuestionCount > 0 && <div><span>たんい</span><strong>{today.units}問</strong></div>}
            </div>
            <button className="start-button" type="button" disabled={!canStart} onClick={() => onStartKanji(startMode)}>
              {contentError ? "問題を読み込めません" : questionCount > 0 ? "今日の漢字をはじめる" : "問題を読み込み中…"}
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
            {subjects.map((subject) => (
              <button
                className={`subject-card ${subject.ready ? "ready" : ""}`}
                type="button"
                disabled={!subject.ready}
                onClick={subject.start}
                key={subject.name}
              >
                <span className="subject-icon">{subject.icon}</span>
                <strong>{subject.name}</strong>
                <small>{subject.ready ? subject.hint : subject.note}</small>
              </button>
            ))}
          </div>
        </section>

        <PetWidget />
      </main>
    </div>
  );
}
