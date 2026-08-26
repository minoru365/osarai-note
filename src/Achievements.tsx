import { useEffect, useState } from "react";
import { getLocalDate } from "./dailySession";
import { PET_EMOJI, PET_LABEL } from "./petPresentation";
import { studyStorage } from "./storage/indexedDb";
import { UNIT_CATEGORIES, UNIT_CATEGORY_LABEL, type UnitCategory } from "./units";
import type { CompletedPet, KanjiState, StudyAttempt, UnitState } from "./storage/schema";

type Props = {
  onBack: () => void;
  onPracticeKanji: (kanji: string) => void;
  onPracticeUnit: (category: UnitCategory) => void;
};

const MASTERED_WEAKNESS = 0;
/**
 * Display bands over the 0-10 counter. The old thresholds only showed 0 and
 * 5-or-more, so the 1-4 band was invisible - and because the selector serves
 * the least-practised first, most kanji sat there for weeks. Bands now cover
 * the whole range so one presentation is enough to place a kanji somewhere.
 */
const WEAK_THRESHOLD = 3;
const NEEDS_WORK_THRESHOLD = 1;

export function masteredKanji(states: KanjiState[]): string[] {
  return states
    .filter((state) => (
      (state.reading.presentations > 0 && state.reading.weakness === MASTERED_WEAKNESS)
      || (state.writing.presentations > 0 && state.writing.weakness === MASTERED_WEAKNESS)
    ))
    .map((state) => state.kanji)
    .sort();
}

/** Practised, weakness 1-2: worth another look but not struggling. */
export function needsWorkKanji(states: KanjiState[]): string[] {
  const band = (stats: KanjiState["reading"]) =>
    stats.presentations > 0 && stats.weakness >= NEEDS_WORK_THRESHOLD && stats.weakness < WEAK_THRESHOLD;
  return states
    .filter((state) => band(state.reading) || band(state.writing))
    .filter((state) => state.reading.weakness < WEAK_THRESHOLD && state.writing.weakness < WEAK_THRESHOLD)
    .map((state) => state.kanji)
    .sort();
}

export function weakKanji(states: KanjiState[]): string[] {
  return states
    .filter((state) => state.reading.weakness >= WEAK_THRESHOLD || state.writing.weakness >= WEAK_THRESHOLD)
    .map((state) => state.kanji)
    .sort();
}

export function countStudyDays(attempts: StudyAttempt[]): number {
  return new Set(attempts.map((attempt) => getLocalDate(new Date(attempt.answeredAt)))).size;
}

/** Units the child has answered, weakest first, for the units panel. */
export function rankUnitStates(states: UnitState[]): UnitState[] {
  return states
    .filter((state) => state.presentations > 0)
    .sort((left, right) => right.weakness - left.weakness || left.key.localeCompare(right.key));
}

export type SkillLevel = { key: "none" | "good" | "ok" | "weak"; label: string };

/**
 * Turns the 0-10 weakness counter into something a child can read. Weakness 0
 * means two different things - never practised, or answered without mistakes -
 * so presentations has to be consulted before calling anything とくい.
 */
export function skillLevel(weakness: number, presentations: number): SkillLevel {
  if (presentations === 0) return { key: "none", label: "まだ" };
  if (weakness === 0) return { key: "good", label: "とくい" };
  if (weakness >= WEAK_THRESHOLD) return { key: "weak", label: "にがて" };
  return { key: "ok", label: "もう少し" };
}

export type UnitCategorySummary = {
  category: UnitCategory;
  label: string;
  presentations: number;
  firstTryCorrect: number;
  weakness: number;
};

/**
 * Rolls the stored `category:questionType` keys up to one row per unit, which
 * is what the child actually thinks in. The stored keys are left untouched;
 * this is a display-time view over them.
 */
export function summarizeUnitCategories(states: UnitState[]): UnitCategorySummary[] {
  return UNIT_CATEGORIES.map((category) => {
    const rows = states.filter((state) => state.key.split(":")[0] === category && state.presentations > 0);
    const presentations = rows.reduce((total, row) => total + row.presentations, 0);
    const firstTryCorrect = rows.reduce((total, row) => total + row.firstTryCorrect, 0);
    // Weight each question type by how much it was actually practised, so one
    // stray answer in a rare type cannot brand the whole unit にがて.
    const weighted = rows.reduce((total, row) => total + row.weakness * row.presentations, 0);
    return {
      category,
      label: UNIT_CATEGORY_LABEL[category],
      presentations,
      firstTryCorrect,
      weakness: presentations === 0 ? 0 : Math.round(weighted / presentations),
    };
  })
    .filter((summary) => summary.presentations > 0)
    .sort((left, right) => right.weakness - left.weakness || left.label.localeCompare(right.label));
}

export function Achievements({ onBack, onPracticeKanji, onPracticeUnit }: Props) {
  const [loading, setLoading] = useState(true);
  const [studyDays, setStudyDays] = useState(0);
  const [mastered, setMastered] = useState<string[]>([]);
  const [needsWork, setNeedsWork] = useState<string[]>([]);
  const [weak, setWeak] = useState<string[]>([]);
  const [completedPets, setCompletedPets] = useState<CompletedPet[]>([]);
  const [unitSummaries, setUnitSummaries] = useState<UnitCategorySummary[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      studyStorage.listAttempts(),
      studyStorage.listKanjiStates(),
      studyStorage.getMotivationState(),
      studyStorage.listUnitStates(),
    ]).then(([attempts, states, motivation, units]) => {
      if (!active) return;
      setStudyDays(countStudyDays(attempts));
      setMastered(masteredKanji(states));
      setNeedsWork(needsWorkKanji(states));
      setWeak(weakKanji(states));
      setCompletedPets(motivation.completedPets);
      setUnitSummaries(summarizeUnitCategories(units));
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return (
    <div className="app-shell achievements-shell">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={onBack}>
          <span className="brand-mark">学</span><span>おさらいノート</span>
        </button>
        <div className="spike-label">がんばり記録</div>
        <button className="header-action" type="button" onClick={onBack}>ホームへ戻る</button>
      </header>

      <main className="achievements-workspace" aria-busy={loading}>
        <section className="achievements-stat-row">
          <div className="achievements-stat">
            <span>がくしゅうした日</span>
            <strong>{studyDays}日</strong>
          </div>
          <div className="achievements-stat">
            <span>できるようになった漢字</span>
            <strong>{mastered.length}字</strong>
          </div>
          <div className="achievements-stat">
            <span>もう少しの漢字</span>
            <strong>{needsWork.length}字</strong>
          </div>
          <div className="achievements-stat">
            <span>にがてな漢字</span>
            <strong>{weak.length}字</strong>
          </div>
        </section>

        <section className="achievements-panel">
          <h2>できるようになった漢字</h2>
          <p className="achievements-hint">タップするとその漢字を練習できるよ</p>
          {mastered.length === 0
            ? <p className="achievements-empty">これから増えていくよ</p>
            : (
              <div className="achievements-kanji-list">
                {mastered.map((kanji) => (
                  <button type="button" key={kanji} onClick={() => onPracticeKanji(kanji)}>{kanji}</button>
                ))}
              </div>
            )}
        </section>

        <section className="achievements-panel">
          <h2>もう少しの漢字</h2>
          <p className="achievements-hint">タップするとその漢字を練習できるよ</p>
          {needsWork.length === 0
            ? <p className="achievements-empty">今のところ無いよ</p>
            : (
              <div className="achievements-kanji-list achievements-kanji-needswork">
                {needsWork.map((kanji) => (
                  <button type="button" key={kanji} onClick={() => onPracticeKanji(kanji)}>{kanji}</button>
                ))}
              </div>
            )}
        </section>

        <section className="achievements-panel">
          <h2>にがてな漢字</h2>
          <p className="achievements-hint">つぎの練習で先に出てくるよ</p>
          {weak.length === 0
            ? <p className="achievements-empty">今のところ無いよ</p>
            : (
              <div className="achievements-kanji-list achievements-kanji-weak">
                {weak.map((kanji) => (
                  <button type="button" key={kanji} onClick={() => onPracticeKanji(kanji)}>{kanji}</button>
                ))}
              </div>
            )}
        </section>

        <section className="achievements-panel">
          <h2>たんい</h2>
          <p className="achievements-hint">タップするとそのたんいを練習できるよ</p>
          {unitSummaries.length === 0
            ? <p className="achievements-empty">まだ練習していないよ</p>
            : (
              <ul className="achievements-unit-list">
                {unitSummaries.map((summary) => {
                  const level = skillLevel(summary.weakness, summary.presentations);
                  return (
                    <li key={summary.category}>
                      <button type="button" onClick={() => onPracticeUnit(summary.category)}>
                        <span className="unit-name">{summary.label}</span>
                        <i aria-hidden="true"><b className={`level-${level.key}`} style={{ width: `${Math.max(summary.weakness, 1) * 10}%` }} /></i>
                        <span className={`achievements-level level-${level.key}`}>{level.label}</span>
                        <em>{summary.presentations}問中 {summary.firstTryCorrect}問せいかい</em>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
        </section>

        <section className="achievements-panel">
          <h2>そだてた なかま</h2>
          {completedPets.length === 0
            ? <p className="achievements-empty">まだいないよ。ポイントをためて育てよう</p>
            : (
              <div className="achievements-pet-list">
                {completedPets.map((pet) => (
                  <div className="achievements-pet" key={`${pet.species}-${pet.completedAt}`}>
                    <span className="achievements-pet-emoji" aria-hidden="true">{PET_EMOJI[pet.species]}</span>
                    <span>{PET_LABEL[pet.species]}</span>
                  </div>
                ))}
              </div>
            )}
        </section>
      </main>
    </div>
  );
}
