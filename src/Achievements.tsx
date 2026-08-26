import { useEffect, useState } from "react";
import { getLocalDate } from "./dailySession";
import { PET_EMOJI, PET_LABEL } from "./petPresentation";
import { studyStorage } from "./storage/indexedDb";
import type { CompletedPet, KanjiState, StudyAttempt } from "./storage/schema";

type Props = {
  onBack: () => void;
};

const MASTERED_WEAKNESS = 0;
const WEAK_THRESHOLD = 5;

export function masteredKanji(states: KanjiState[]): string[] {
  return states
    .filter((state) => (
      (state.reading.presentations > 0 && state.reading.weakness === MASTERED_WEAKNESS)
      || (state.writing.presentations > 0 && state.writing.weakness === MASTERED_WEAKNESS)
    ))
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

export function Achievements({ onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [studyDays, setStudyDays] = useState(0);
  const [mastered, setMastered] = useState<string[]>([]);
  const [weak, setWeak] = useState<string[]>([]);
  const [completedPets, setCompletedPets] = useState<CompletedPet[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      studyStorage.listAttempts(),
      studyStorage.listKanjiStates(),
      studyStorage.getMotivationState(),
    ]).then(([attempts, states, motivation]) => {
      if (!active) return;
      setStudyDays(countStudyDays(attempts));
      setMastered(masteredKanji(states));
      setWeak(weakKanji(states));
      setCompletedPets(motivation.completedPets);
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
            <strong>{weak.length}字</strong>
          </div>
        </section>

        <section className="achievements-panel">
          <h2>できるようになった漢字</h2>
          {mastered.length === 0
            ? <p className="achievements-empty">これから増えていくよ</p>
            : <div className="achievements-kanji-list">{mastered.map((kanji) => <span key={kanji}>{kanji}</span>)}</div>}
        </section>

        <section className="achievements-panel">
          <h2>もう少しの漢字</h2>
          {weak.length === 0
            ? <p className="achievements-empty">今のところ無いよ</p>
            : <div className="achievements-kanji-list">{weak.map((kanji) => <span key={kanji}>{kanji}</span>)}</div>}
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
