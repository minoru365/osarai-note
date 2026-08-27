import { useEffect, useState } from "react";
import { getLocalDate } from "./dailySession";
import { PetWidget } from "./PetWidget";
import { studyStorage } from "./storage/indexedDb";
import { SELECTABLE_GRADES, type SelectableGrade } from "./storage/schema";

type Props = {
  questionCount: number;
  readingQuestionCount: number;
  writingQuestionCount: number;
  contentError: string;
  onStartKanji: () => void;
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
  /** Secondary action shown inside the card, e.g. picking a kanji to practise. */
  sub?: { label: string; onClick: () => void };
};

type TodayProgress = { reading: number; writing: number; units: number };

function countCompleted(sessions: { items: { status: string }[] }[]): number {
  return sessions.reduce(
    (total, session) => total + session.items.filter((item) => item.status === "completed").length,
    0,
  );
}

export function Home({ questionCount, readingQuestionCount, writingQuestionCount, contentError, onStartKanji, onOpenFreePractice, onOpenKanjiSettings, onOpenAchievements, unitQuestionCount, onStartUnits }: Props) {
  const [grades, setGrades] = useState<SelectableGrade[] | null>(null);
  const gradeChosen = grades !== null && grades.length > 0;
  const canStart = questionCount > 0 && !contentError && gradeChosen;
  const canStartUnits = unitQuestionCount > 0 && !contentError && gradeChosen;
  const [today, setToday] = useState<TodayProgress>({ reading: 0, writing: 0, units: 0 });

  useEffect(() => {
    let active = true;
    void studyStorage.getGradeSettings()
      .then((settings) => { if (active) setGrades(settings.grades); })
      .catch(() => { if (active) setGrades([...SELECTABLE_GRADES]); });
    return () => { active = false; };
  }, []);

  // Shared by every subject (ADR-0009), so it is saved rather than kept per screen.
  const toggleGrade = (grade: SelectableGrade) => {
    const next = (grades ?? []).includes(grade)
      ? (grades ?? []).filter((item) => item !== grade)
      : [...(grades ?? []), grade].sort();
    setGrades(next);
    void studyStorage.saveGradeSettings({ id: "grades", grades: next, updatedAt: new Date().toISOString() });
  };

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

  const subjects: Subject[] = [
    {
      icon: "字", name: "漢字", note: "3・4年生", ready: canStart,
      hint: "読み・書きを練習", start: onStartKanji,
      sub: { label: "選んで練習", onClick: onOpenFreePractice },
    },
    {
      icon: "単", name: "単位", note: "準備中", ready: canStartUnits,
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
        <span aria-hidden="true" />
        <div className="header-nav">
          <button className="header-action" type="button" onClick={onOpenAchievements}>がんばり記録</button>
          <button className="header-action" type="button" onClick={onOpenKanjiSettings}>保護者設定</button>
        </div>
      </header>

      <main className="home-workspace">
        <section className="today-card">
          <div className="today-copy">
            <p className="eyebrow">今日の学習</p>
            <h1>今日のおさらいを<br />はじめよう</h1>
            <p>右の教科をえらぶと、10問はじまります。</p>
            <div className="today-progress" aria-label="今日の学習の進み具合">
              <div><span>読み</span><strong>{today.reading}問</strong></div>
              <div><span>書き</span><strong>{today.writing}問</strong></div>
              {unitQuestionCount > 0 && <div><span>たんい</span><strong>{today.units}問</strong></div>}
            </div>
            <div className="grade-choice home-grade-choice" role="group" aria-label="学年（複数選べます）">
              {SELECTABLE_GRADES.map((grade) => (
                <label className={(grades ?? []).includes(grade) ? "selected" : ""} key={grade}>
                  <input
                    type="checkbox"
                    checked={(grades ?? []).includes(grade)}
                    onChange={() => toggleGrade(grade)}
                  />
                  <span>{grade}年生</span>
                </label>
              ))}
              {grades !== null && grades.length === 0 && <small className="grade-warning">学年を選んでね</small>}
            </div>
            {contentError && <small className="home-error">{contentError}</small>}
          </div>
        </section>

        <section className="home-section">
          <div className="section-heading">
            <div><p className="eyebrow">教科から練習</p><h2>何を復習する？</h2></div>
          </div>
          <div className="subject-grid">
            {subjects.map((subject) => (
              <div className={`subject-card ${subject.ready ? "ready" : ""}`} key={subject.name}>
                <button
                  className="subject-main"
                  type="button"
                  disabled={!subject.ready}
                  onClick={subject.start}
                >
                  <span className="subject-icon">{subject.icon}</span>
                  <strong>{subject.name}</strong>
                  <small>{subject.ready ? subject.hint : subject.note}</small>
                </button>
                {subject.sub && subject.ready && (
                  <button className="subject-sub" type="button" onClick={subject.sub.onClick}>
                    {subject.sub.label}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <PetWidget />
      </main>
    </div>
  );
}
