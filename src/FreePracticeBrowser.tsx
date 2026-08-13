import { useEffect, useMemo, useState } from "react";
import type { KanjiQuestion } from "./contentPack";
import { studyStorage } from "./storage/indexedDb";
import type { KanjiState, KanjiStudyMode } from "./storage/schema";

type Props = {
  questions: KanjiQuestion[];
  onBack: () => void;
  onSelect: (question: KanjiQuestion) => void;
  onSettings: () => void;
};

export function filterFreePracticeQuestions(
  questions: KanjiQuestion[],
  states: Map<string, KanjiState>,
): KanjiQuestion[] {
  return questions.filter((question) =>
    question.targetKanji.every((kanji) => states.get(kanji)?.learned !== false),
  );
}

export function FreePracticeBrowser({ questions, onBack, onSelect, onSettings }: Props) {
  const [mode, setMode] = useState<KanjiStudyMode>("reading");
  const [grade, setGrade] = useState<3 | 4>(3);
  const [query, setQuery] = useState("");
  const [states, setStates] = useState<Map<string, KanjiState>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void studyStorage.listKanjiStates().then(
      (items) => {
        if (!active) return;
        setStates(new Map(items.map((item) => [item.kanji, item])));
        setLoading(false);
      },
      () => {
        if (!active) return;
        setError("未履修の設定を読み込めませんでした");
        setLoading(false);
      },
    );
    return () => { active = false; };
  }, []);

  const eligible = useMemo(() => filterFreePracticeQuestions(questions, states), [questions, states]);
  const visible = useMemo(() => {
    const normalizedQuery = query.trim();
    return eligible.filter((question) => question.mode === mode && question.grade === grade)
      .filter((question) => !normalizedQuery
        || question.word.includes(normalizedQuery)
        || question.reading.includes(normalizedQuery)
        || question.targetKanji.some((kanji) => kanji.includes(normalizedQuery)));
  }, [eligible, grade, mode, query]);

  return (
    <div className="app-shell free-practice-shell">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={onBack}><span className="brand-mark">学</span><span>おさらいノート</span></button>
        <div className="spike-label">自由練習</div>
        <button className="header-action" type="button" onClick={onSettings}>未習漢字を設定</button>
      </header>
      <main className="free-practice-workspace">
        <section className="free-practice-panel">
          <div className="free-practice-heading">
            <div><p className="eyebrow">問題を選んで練習</p><h1>どの問題にする？</h1></div>
            <p>正誤は苦手度に反映されます。未習にした漢字を含む問題は表示しません。</p>
          </div>
          <div className="free-practice-toolbar">
            <div className="segmented" aria-label="問題形式">
              <button className={mode === "reading" ? "selected" : ""} type="button" aria-pressed={mode === "reading"} onClick={() => setMode("reading")}>読み</button>
              <button className={mode === "writing" ? "selected" : ""} type="button" aria-pressed={mode === "writing"} onClick={() => setMode("writing")}>書き</button>
            </div>
            <div className="segmented" aria-label="学年">
              <button className={grade === 3 ? "selected" : ""} type="button" aria-pressed={grade === 3} onClick={() => setGrade(3)}>3年生</button>
              <button className={grade === 4 ? "selected" : ""} type="button" aria-pressed={grade === 4} onClick={() => setGrade(4)}>4年生</button>
            </div>
            <label className="free-practice-search"><span>漢字・語句を探す</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例：暗、くらい" /></label>
            <strong className="free-practice-count">{visible.length}問</strong>
          </div>
          {loading || error
            ? <div className="free-practice-empty">{loading ? "問題を準備しています…" : error}</div>
            : visible.length === 0
              ? <div className="free-practice-empty">条件に合う問題がありません。未習漢字の設定も確認してください。</div>
              : <div className="free-practice-grid">
                {visible.map((question) => (
                  <button type="button" onClick={() => onSelect(question)} key={question.id}>
                    <span>{question.targetKanji.join("・")}</span>
                    <strong>{question.word}</strong>
                    <small>{question.reading}</small>
                  </button>
                ))}
              </div>}
        </section>
      </main>
    </div>
  );
}
