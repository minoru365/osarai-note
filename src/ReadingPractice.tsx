import { useEffect, useRef, useState } from "react";
import type { KanjiReadingQuestion } from "./contentPack";
import { createId } from "./id";
import {
  applyDakuten,
  applyHandakuten,
  deleteLastKana,
  HIRAGANA_GRID,
  isCorrectReading,
  toggleSmallKana,
} from "./kanaInput";
import { studyStorage } from "./storage/indexedDb";

type Props = {
  questions: KanjiReadingQuestion[];
  onHome: () => void;
  onWriting: () => void;
  onSettings: () => void;
};

export function ReadingPractice({ questions, onHome, onWriting, onSettings }: Props) {
  const [eligibleQuestions, setEligibleQuestions] = useState<KanjiReadingQuestion[]>(questions);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [mistakes, setMistakes] = useState(0);
  const [result, setResult] = useState<"input" | "correct" | "incorrect">("input");
  const [feedback, setFeedback] = useState("漢字の部分だけを入力してね");
  const sessionIdRef = useRef(createId());

  useEffect(() => {
    let active = true;
    void studyStorage.listKanjiStates().then((states) => {
      if (!active) return;
      const stateMap = new Map(states.map((state) => [state.kanji, state]));
      setEligibleQuestions(questions.filter((question) =>
        question.targetKanji.every((kanji) => stateMap.get(kanji)?.learned !== false),
      ));
      setQuestionIndex(0);
    });
    return () => { active = false; };
  }, [questions]);

  const question = eligibleQuestions[questionIndex];
  const progress = eligibleQuestions.length === 0 ? 0 : ((questionIndex + 1) / eligibleQuestions.length) * 100;

  const resetFeedback = () => {
    setResult("input");
    setFeedback("漢字の部分だけを入力してね");
  };

  const appendKana = (character: string) => {
    if (result === "correct" || character === "・" || Array.from(answer).length >= 12) return;
    setAnswer((current) => current + character);
    resetFeedback();
  };

  const modify = (operation: (value: string) => string) => {
    if (result === "correct") return;
    setAnswer(operation);
    resetFeedback();
  };

  const saveAnswer = (correct: boolean, nextMistakes: number) => {
    if (!question) return;
    void studyStorage.saveAttempt({
      id: createId(),
      sessionId: sessionIdRef.current,
      questionId: question.id,
      subject: "kanji",
      mode: "reading",
      answer,
      correct,
      mistakes: nextMistakes,
      usedGuide: false,
      answeredAt: new Date().toISOString(),
    });
  };

  const submit = () => {
    if (!question || !answer) {
      setResult("incorrect");
      setFeedback("50音表から読みを入力してね");
      return;
    }
    const correct = isCorrectReading(answer, question.reading);
    const nextMistakes = correct ? mistakes : mistakes + 1;
    setMistakes(nextMistakes);
    saveAnswer(correct, nextMistakes);
    setResult(correct ? "correct" : "incorrect");
    setFeedback(correct
      ? `そのとおり！ 「${question.word}」は「${question.reading}」と読むよ。`
      : `おしい。文の中の「${question.word}」の読みをもう一度考えてみよう。`);
  };

  const nextQuestion = () => {
    if (questionIndex + 1 >= eligibleQuestions.length) return;
    setQuestionIndex((current) => current + 1);
    setAnswer("");
    setMistakes(0);
    resetFeedback();
  };

  if (!question) {
    return (
      <div className="app-shell">
        <PracticeHeader mode="reading" progress={0} onHome={onHome} onReading={() => undefined} onWriting={onWriting} onSettings={onSettings} />
        <main className="content-loading"><strong>出題できる読み問題がありません</strong><span>未習漢字の設定を確認してください。</span></main>
      </div>
    );
  }

  return (
    <div className="app-shell reading-shell">
      <PracticeHeader mode="reading" progress={progress} onHome={onHome} onReading={() => undefined} onWriting={onWriting} onSettings={onSettings} />
      <main className="reading-workspace">
        <section className="reading-question-card">
          <p className="eyebrow">漢字の読み</p>
          <p className="reading-prompt">
            {question.promptBefore}<span className="reading-target">{question.word}</span>{question.promptAfter}
          </p>
          <div className={`reading-answer ${result === "correct" ? "correct" : result === "incorrect" ? "incorrect" : ""}`} aria-live="polite">
            {answer || <span>50音表から入力しよう</span>}
          </div>
          <div className={`reading-feedback ${result}`} aria-live="polite">{feedback}</div>
          <div className="reading-question-footer">
            <span>{question.grade}年生の漢字</span>
            <span>● {questionIndex + 1} / {eligibleQuestions.length}問</span>
          </div>
        </section>

        <section className="kana-panel" aria-label="50音入力">
          <div className="kana-tools">
            <strong className="kana-panel-title">ひらがな50音</strong>
            <div className="kana-tool-row">
              <button type="button" onClick={() => modify(toggleSmallKana)}>小文字</button>
              <button className="kana-mark-button" type="button" aria-label="濁音" onClick={() => modify(applyDakuten)}><span aria-hidden="true">゛</span><small>濁音</small></button>
              <button className="kana-mark-button" type="button" aria-label="半濁音" onClick={() => modify(applyHandakuten)}><span aria-hidden="true">゜</span><small>半濁音</small></button>
              <button type="button" onClick={() => modify(deleteLastKana)}>一字消す</button>
              <button type="button" onClick={() => { setAnswer(""); resetFeedback(); }}>全部消す</button>
            </div>
          </div>
          <div className="kana-grid">
            {HIRAGANA_GRID.map((character, index) => (
              <button
                type="button"
                disabled={character === "・" || result === "correct"}
                onClick={() => appendKana(character)}
                key={`${character}-${index}`}
              >{character === "・" ? "" : character}</button>
            ))}
          </div>
          {result === "correct" && questionIndex + 1 === eligibleQuestions.length
            ? <div className="reading-complete" role="status">読み問題はここまでです</div>
            : result === "correct"
            ? <button className="reading-submit next" type="button" onClick={nextQuestion}>次へ</button>
            : <button className="reading-submit" type="button" onClick={submit}>回答する</button>}
        </section>
      </main>
    </div>
  );
}

type HeaderProps = {
  mode: "reading" | "writing";
  progress: number;
  onHome: () => void;
  onReading: () => void;
  onWriting: () => void;
  onSettings: () => void;
};

export function PracticeHeader({ mode, progress, onHome, onReading, onWriting, onSettings }: HeaderProps) {
  return (
    <header className="topbar practice-topbar">
      <button className="brand brand-button" type="button" onClick={onHome}><span className="brand-mark">学</span><span>おさらいノート</span></button>
      <div className="practice-mode-switch" aria-label="問題形式">
        <button type="button" aria-pressed={mode === "reading"} onClick={onReading}>読み</button>
        <button type="button" aria-pressed={mode === "writing"} onClick={onWriting}>書き</button>
      </div>
      <div className="practice-header-end">
        <div className="practice-progress"><span className="practice-progress-fill" style={{ width: `${progress}%` }} /></div>
        <button className="compact-header-button" type="button" onClick={onHome}>ホーム</button>
        <button className="compact-header-button" type="button" onClick={onSettings}>設定</button>
      </div>
    </header>
  );
}
