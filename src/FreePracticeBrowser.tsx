import { useEffect, useMemo, useState } from "react";
import type { KanjiQuestion } from "./contentPack";
import { createId } from "./id";
import { getKanjiByGrade, type KanjiGrade } from "./kanjiCatalog";
import { studyStorage } from "./storage/indexedDb";
import { SELECTABLE_GRADES, createEmptyKanjiSkillStats, type KanjiState } from "./storage/schema";

const BATCH_SIZE = 10;
const ALL_GRADES: KanjiGrade[] = [...SELECTABLE_GRADES];

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

/**
 * Katakana to hiragana so a child typing either kind finds the same kanji.
 * Readings are stored on-yomi in katakana and kun-yomi in hiragana.
 */
export function normalizeReading(value: string): string {
  return Array.from(value.trim()).map((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : character;
  }).join("");
}

/** Every reading each kanji is practised with, for the search box. */
export function buildReadingIndex(questions: KanjiQuestion[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  questions.forEach((question) => {
    const kanji = question.primaryKanji;
    const reading = question.canonicalReading;
    if (!kanji || !reading) return;
    const readings = index.get(kanji) ?? [];
    if (!readings.includes(reading)) readings.push(reading);
    index.set(kanji, readings);
  });
  return index;
}

/** Matches on the kanji itself or on any of its readings, in either kana. */
export function matchesKanjiSearch(character: string, readings: string[], query: string): boolean {
  const normalized = normalizeReading(query);
  if (normalized.length === 0) return true;
  if (character === query.trim()) return true;
  return readings.some((reading) => normalizeReading(reading).includes(normalized));
}

/**
 * Distinct question pairs per kanji, capped like a real batch, computed in one
 * pass so the list stays cheap when every grade is shown at once.
 */
export function countQuestionsPerKanji(questions: KanjiQuestion[]): Map<string, number> {
  const pairsByKanji = new Map<string, Set<string>>();
  questions.forEach((question) => {
    const pair = question.pairId ?? question.id.replace(/:(reading|writing)$/u, "");
    question.targetKanji.forEach((kanji) => {
      const pairs = pairsByKanji.get(kanji) ?? new Set<string>();
      pairs.add(pair);
      pairsByKanji.set(kanji, pairs);
    });
  });
  return new Map([...pairsByKanji].map(([kanji, pairs]) => [kanji, Math.min(pairs.size, BATCH_SIZE)]));
}

function defaultState(character: string): KanjiState {
  return { kanji: character, learned: true, reading: createEmptyKanjiSkillStats(), writing: createEmptyKanjiSkillStats(), updatedAt: "" };
}

export function FreePracticeBrowser({ questions, onBack, onStart }: Props) {
  // Shared with the home screen and the other subjects (ADR-0009).
  const [grades, setGrades] = useState<KanjiGrade[]>([]);
  const [search, setSearch] = useState("");
  const [states, setStates] = useState<Map<string, KanjiState>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void studyStorage.getGradeSettings()
      .then((settings) => { if (active) setGrades(settings.grades); })
      .catch(() => { if (active) setGrades([...SELECTABLE_GRADES]); });
    return () => { active = false; };
  }, []);

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
  const gradeQuestions = useMemo(
    () => eligible.filter((question) => grades.includes(question.grade)),
    [eligible, grades],
  );
  const readingIndex = useMemo(() => buildReadingIndex(questions), [questions]);
  const counts = useMemo(() => countQuestionsPerKanji(gradeQuestions), [gradeQuestions]);

  const entries = useMemo(() => grades.flatMap((grade) => getKanjiByGrade(grade))
    .filter((entry) => states.get(entry.character)?.learned !== false)
    .filter((entry) => matchesKanjiSearch(entry.character, readingIndex.get(entry.character) ?? [], search))
    .map((entry) => ({
      ...entry,
      state: states.get(entry.character) ?? defaultState(entry.character),
      questionCount: counts.get(entry.character) ?? 0,
      readings: readingIndex.get(entry.character) ?? [],
    })), [grades, states, counts, readingIndex, search]);

  const start = (selectedKanji?: string) => {
    const batch = createFreePracticeBatch(gradeQuestions, createId(), selectedKanji);
    if (batch.length > 0) onStart(batch);
  };

  const gradeLabel = grades.length === ALL_GRADES.length
    ? "全学年"
    : grades.length === 0 ? "学年みせんたく" : `${grades.join("・")}年生`;

  return (
    <div className="app-shell free-practice-shell">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={onBack}><span className="brand-mark">学</span><span>おさらいノート</span></button>
        <div className="spike-label">自由練習</div>
        <button className="header-action" type="button" onClick={onBack}>ホームへ戻る</button>
      </header>
      <main className="free-practice-workspace">
        <section className="free-practice-panel">
          <div className="free-practice-fixed">
            <div className="free-practice-heading">
              <div><p className="eyebrow">自由に復習</p><h1>漢字を練習しよう</h1></div>
              <p>ランダムに10問、または漢字を選んで関連問題を練習できます。学年はホームで設定します。</p>
            </div>
            <div className="free-practice-toolbar">
              <label className="reading-search">
                <span className="visually-hidden">読みで検索</span>
                <input
                  type="search"
                  value={search}
                  placeholder="読みでさがす"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              {search.length > 0 && (
                <button className="reading-search-clear" type="button" onClick={() => setSearch("")}>けす</button>
              )}
              <button className="free-practice-start" type="button" disabled={loading || gradeQuestions.length === 0} onClick={() => start()}>ランダム10問で練習開始</button>
              <span>{gradeQuestions.length === 0 ? "確認済み問題はまだありません" : `${createFreePracticeBatch(gradeQuestions, "count").length}問で開始できます`}</span>
            </div>
          </div>
          {loading || error
            ? <div className="free-practice-empty">{loading ? "問題を準備しています…" : error}</div>
            : entries.length === 0
              ? <div className="free-practice-empty">{grades.length === 0 ? "ホームで学年をえらんでね" : "見つからなかったよ。ほかの読みでさがしてみよう"}</div>
              : <div className="free-practice-kanji-scroll">
                <div className="free-practice-list-heading"><strong>{gradeLabel}の漢字</strong><span>{entries.length}字</span></div>
                <div className="free-practice-kanji-grid">
                  {entries.map((entry) => (
                    <button type="button" disabled={entry.questionCount === 0} onClick={() => start(entry.character)} key={entry.character}>
                      <strong>{entry.character}</strong>
                      {entry.readings.length > 0 && <span className="kanji-readings">{entry.readings.join("・")}</span>}
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
