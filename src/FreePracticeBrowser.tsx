import { useEffect, useMemo, useState } from "react";
import type { KanjiQuestion } from "./contentPack";
import { createId } from "./id";
import { getKanjiByGrade, type KanjiGrade } from "./kanjiCatalog";
import { studyStorage } from "./storage/indexedDb";
import { createEmptyKanjiSkillStats, type KanjiState } from "./storage/schema";

const PAGE_SIZE = 10;

type Props = {
  questions: KanjiQuestion[];
  onBack: () => void;
  onSelect: (question: KanjiQuestion) => void;
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
  return [...items].sort((left, right) =>
    stableHash(`${seed}:${key(left)}`) - stableHash(`${seed}:${key(right)}`),
  );
}

export function filterFreePracticeQuestions(
  questions: KanjiQuestion[],
  states: Map<string, KanjiState>,
): KanjiQuestion[] {
  return questions.filter((question) =>
    question.targetKanji.every((kanji) => states.get(kanji)?.learned !== false),
  );
}

function defaultState(character: string): KanjiState {
  return {
    kanji: character,
    learned: true,
    reading: createEmptyKanjiSkillStats(),
    writing: createEmptyKanjiSkillStats(),
    updatedAt: "",
  };
}

export function FreePracticeBrowser({ questions, onBack, onSelect }: Props) {
  const [grade, setGrade] = useState<KanjiGrade>(3);
  const [states, setStates] = useState<Map<string, KanjiState>>(new Map());
  const [selectedKanji, setSelectedKanji] = useState("");
  const [page, setPage] = useState(0);
  const [seed, setSeed] = useState(createId());
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
  const pairRepresentatives = useMemo(() => {
    const pairs = new Map<string, KanjiQuestion>();
    eligible.filter((question) => question.grade === grade).forEach((question) => {
      const pairKey = question.pairId ?? question.id.replace(/:(reading|writing)$/u, "");
      if (!pairs.has(pairKey) || question.mode === "reading") pairs.set(pairKey, question);
    });
    return [...pairs.values()];
  }, [eligible, grade]);

  const kanjiEntries = useMemo(() => stableRandomOrder(
    getKanjiByGrade(grade)
      .filter((entry) => states.get(entry.character)?.learned !== false)
      .map((entry) => ({ ...entry, state: states.get(entry.character) ?? defaultState(entry.character) })),
    seed,
    (entry) => entry.character,
  ), [grade, pairRepresentatives, seed, states]);

  const relatedQuestions = useMemo(() => selectedKanji
    ? stableRandomOrder(
      pairRepresentatives.filter((question) => question.targetKanji.includes(selectedKanji)),
      `${seed}:${selectedKanji}`,
      (question) => question.pairId ?? question.id,
    )
    : [], [pairRepresentatives, seed, selectedKanji]);
  const pageCount = Math.max(1, Math.ceil(kanjiEntries.length / PAGE_SIZE));
  const visibleKanji = kanjiEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const changeGrade = (nextGrade: KanjiGrade) => {
    setGrade(nextGrade);
    setSelectedKanji("");
    setPage(0);
    setSeed(createId());
  };

  const nextPage = () => {
    if (page + 1 < pageCount) setPage(page + 1);
    else {
      setPage(0);
      setSeed(createId());
    }
    setSelectedKanji("");
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
          <div className="free-practice-heading">
            <div><p className="eyebrow">漢字から問題を選ぶ</p><h1>{selectedKanji ? `「${selectedKanji}」の問題` : "どの漢字にする？"}</h1></div>
            <p>読み・書きの苦手度を見ながら選べます。未習漢字を含む問題は表示しません。</p>
          </div>
          <div className="free-practice-toolbar">
            <div className="segmented" aria-label="学年">
              <button className={grade === 3 ? "selected" : ""} type="button" aria-pressed={grade === 3} onClick={() => changeGrade(3)}>3年生</button>
              <button className={grade === 4 ? "selected" : ""} type="button" aria-pressed={grade === 4} onClick={() => changeGrade(4)}>4年生</button>
            </div>
            {selectedKanji
              ? <button className="free-practice-back" type="button" onClick={() => setSelectedKanji("")}>漢字一覧へ</button>
              : <><span className="free-practice-page">{page + 1} / {pageCount}ページ</span><button className="free-practice-next" type="button" onClick={nextPage}>{page + 1 < pageCount ? "次の10字" : "もう一度まぜる"}</button></>}
          </div>
          {loading || error
            ? <div className="free-practice-empty">{loading ? "問題を準備しています…" : error}</div>
            : selectedKanji
              ? relatedQuestions.length === 0
                ? <div className="free-practice-empty">この漢字の確認済み問題は、まだありません。</div>
                : <div className="free-practice-grid related-problem-grid">
                  {relatedQuestions.map((question) => (
                    <button type="button" onClick={() => onSelect(question)} key={question.pairId ?? question.id}>
                      <span>{question.targetKanji.join("・")}</span><strong>{question.word}</strong><small>{question.reading}</small>
                    </button>
                  ))}
                </div>
              : visibleKanji.length === 0
                ? <div className="free-practice-empty">この学年の公開済み問題がありません。</div>
                : <div className="free-practice-kanji-grid">
                  {visibleKanji.map((entry) => (
                    <button type="button" onClick={() => setSelectedKanji(entry.character)} key={entry.character}>
                      <strong>{entry.character}</strong>
                      <span>読み <i><b style={{ width: `${entry.state.reading.weakness * 10}%` }} /></i><em>{entry.state.reading.weakness}</em></span>
                      <span>書き <i><b style={{ width: `${entry.state.writing.weakness * 10}%` }} /></i><em>{entry.state.writing.weakness}</em></span>
                    </button>
                  ))}
                </div>}
        </section>
      </main>
    </div>
  );
}
