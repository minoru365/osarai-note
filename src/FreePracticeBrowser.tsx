import { useEffect, useMemo, useState } from "react";
import type { KanjiQuestion } from "./contentPack";
import { createId } from "./id";
import { getKanjiByGrade, type KanjiGrade } from "./kanjiCatalog";
import { studyStorage } from "./storage/indexedDb";
import { createEmptyKanjiSkillStats, type KanjiState } from "./storage/schema";

const BATCH_SIZE = 10;

type Props = {
  questions: KanjiQuestion[];
  onBack: () => void;
  onStart: (questions: KanjiQuestion[]) => void;
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function stableRandomOrder<T>(items: T[], seed: string, key: (item: T) => string): T[] {
  return [...items].sort((left, right) => stableHash(`${seed}:${key(left)}`) - stableHash(`${seed}:${key(right)}`));
}

export function filterFreePracticeQuestions(questions: KanjiQuestion[], states: Map<string, KanjiState>): KanjiQuestion[] {
  return questions.filter((question) => question.targetKanji.every((kanji) => states.get(kanji)?.learned !== false));
}

export function createFreePracticeBatch(
  questions: KanjiQuestion[],
  seed: string,
  selectedKanji?: string,
): KanjiQuestion[] {
  const pairs = new Map<string, KanjiQuestion>();
  questions.filter((question) => !selectedKanji || question.targetKanji.includes(selectedKanji)).forEach((question) => {
    const key = question.pairId ?? question.id.replace(/:(reading|writing)$/u, "");
    if (!pairs.has(key) || question.mode === "reading") pairs.set(key, question);
  });
  return stableRandomOrder([...pairs.values()], seed, (question) => question.pairId ?? question.id).slice(0, BATCH_SIZE);
}

function defaultState(character: string): KanjiState {
  return { kanji: character, learned: true, reading: createEmptyKanjiSkillStats(), writing: createEmptyKanjiSkillStats(), updatedAt: "" };
}

export function FreePracticeBrowser({ questions, onBack, onStart }: Props) {
  const [grade, setGrade] = useState<KanjiGrade>(3);
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
  const gradeQuestions = useMemo(() => eligible.filter((question) => question.grade === grade), [eligible, grade]);
  const entries = useMemo(() => getKanjiByGrade(grade)
    .filter((entry) => states.get(entry.character)?.learned !== false)
    .map((entry) => ({
      ...entry,
      state: states.get(entry.character) ?? defaultState(entry.character),
      questionCount: createFreePracticeBatch(gradeQuestions, "count", entry.character).length,
    })), [grade, gradeQuestions, states]);

  const start = (selectedKanji?: string) => {
    const batch = createFreePracticeBatch(gradeQuestions, createId(), selectedKanji);
    if (batch.length > 0) onStart(batch);
  };

  return (
    <div className="app-shell free-practice-shell">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={onBack}><span className="brand-mark">学</span><span>おさらいノート</span></button>
        <div className="spike-label">自由練習</div>
        <span aria-hidden="true" />
      </header>
      <main className="free-practice-workspace">
        <section className="free-practice-panel">
          <div className="free-practice-fixed">
            <div className="free-practice-heading">
              <div><p className="eyebrow">自由に復習</p><h1>漢字を練習しよう</h1></div>
              <p>学年からランダムに10問、または漢字を選んで関連問題を練習できます。</p>
            </div>
            <div className="free-practice-toolbar">
              <div className="segmented" aria-label="学年">
                <button className={grade === 3 ? "selected" : ""} type="button" aria-pressed={grade === 3} onClick={() => setGrade(3)}>3年生</button>
                <button className={grade === 4 ? "selected" : ""} type="button" aria-pressed={grade === 4} onClick={() => setGrade(4)}>4年生</button>
              </div>
              <button className="free-practice-start" type="button" disabled={loading || gradeQuestions.length === 0} onClick={() => start()}>ランダム10問で練習開始</button>
              <span>{gradeQuestions.length === 0 ? "確認済み問題はまだありません" : `${createFreePracticeBatch(gradeQuestions, "count").length}問で開始できます`}</span>
            </div>
          </div>
          {loading || error
            ? <div className="free-practice-empty">{loading ? "問題を準備しています…" : error}</div>
            : <div className="free-practice-kanji-scroll">
              <div className="free-practice-list-heading"><strong>{grade}年生の漢字</strong><span>{entries.length}字</span></div>
              <div className="free-practice-kanji-grid">
                {entries.map((entry) => (
                  <button type="button" disabled={entry.questionCount === 0} onClick={() => start(entry.character)} key={entry.character}>
                    <strong>{entry.character}</strong>
                    <span>読み <i><b style={{ width: `${entry.state.reading.weakness * 10}%` }} /></i><em>{entry.state.reading.weakness}</em></span>
                    <span>書き <i><b style={{ width: `${entry.state.writing.weakness * 10}%` }} /></i><em>{entry.state.writing.weakness}</em></span>
                    <small>{entry.questionCount > 0 ? `${entry.questionCount}問` : "問題準備中"}</small>
                  </button>
                ))}
              </div>
            </div>}
        </section>
      </main>
    </div>
  );
}
