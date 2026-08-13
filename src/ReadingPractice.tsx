import { useEffect, useRef, useState } from "react";
import type { KanjiReadingQuestion } from "./contentPack";
import { createId } from "./id";
import { summarizeDailySession } from "./dailySession";
import {
  applyDakuten,
  applyHandakuten,
  deleteLastKana,
  HIRAGANA_GRID,
  isCorrectReading,
  toggleSmallKana,
} from "./kanaInput";
import { useDailyKanjiSession } from "./useDailyKanjiSession";
import { studyStorage } from "./storage/indexedDb";

type Props = {
  questions: KanjiReadingQuestion[];
  onHome: () => void;
  onWriting: () => void;
  onSettings: () => void;
  freeQuestion?: KanjiReadingQuestion;
  onFreePracticeList?: () => void;
  onFreePracticeNext?: () => void;
  freeQuestionNumber?: number;
  freeQuestionCount?: number;
};

export function ReadingPractice({ questions, onHome, onWriting, onSettings, freeQuestion, onFreePracticeList, onFreePracticeNext, freeQuestionNumber = 1, freeQuestionCount = 1 }: Props) {
  const [answer, setAnswer] = useState("");
  const [mistakes, setMistakes] = useState(0);
  const [result, setResult] = useState<"input" | "correct" | "incorrect">("input");
  const [feedback, setFeedback] = useState("漢字の部分だけを入力してね");
  const [saving, setSaving] = useState(false);
  const [answeredQuestion, setAnsweredQuestion] = useState<KanjiReadingQuestion | null>(null);
  const freeAttemptId = useRef(createId());
  const freeAttemptAnsweredAt = useRef("");
  useEffect(() => {
    freeAttemptId.current = createId();
    freeAttemptAnsweredAt.current = "";
    setAnswer("");
    setMistakes(0);
    setResult("input");
    setFeedback("漢字の部分だけを入力してね");
    setSaving(false);
    setAnsweredQuestion(null);
  }, [freeQuestion?.id]);
  const { session, currentQuestion, loading, error, recordAnswer, startNext } = useDailyKanjiSession("reading", questions, !freeQuestion);
  const pendingQuestion = freeQuestion ?? (currentQuestion?.mode === "reading" ? currentQuestion : undefined);
  const question = result === "correct" ? answeredQuestion ?? pendingQuestion : pendingQuestion;
  const completed = !freeQuestion && Boolean(session?.completedAt);
  const questionIndex = freeQuestion ? freeQuestionNumber - 1 : Math.max(0, (session?.currentIndex ?? 0) - (result === "correct" ? 1 : 0));
  const questionCount = freeQuestion ? freeQuestionCount : session?.items.length ?? 0;
  const progress = questionCount === 0 ? 0 : (questionIndex / questionCount) * 100;
  const summary = session ? summarizeDailySession(session) : null;

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

  const submit = async () => {
    if (!question || !answer) {
      setResult("incorrect");
      setFeedback("50音表から読みを入力してね");
      return;
    }
    const correct = isCorrectReading(answer, question.reading);
    const nextMistakes = correct ? mistakes : mistakes + 1;
    setSaving(correct || !freeQuestion);
    try {
      if (freeQuestion) {
        if (correct) await studyStorage.recordKanjiFreePracticeAttempt({
          id: freeAttemptId.current,
          sessionId: "free-practice",
          questionId: freeQuestion.id,
          subject: "kanji",
          mode: "reading",
          answer,
          correct: true,
          mistakes: nextMistakes,
          usedGuide: false,
          firstTryCorrect: mistakes === 0,
          targetKanji: freeQuestion.targetKanji,
          answeredAt: freeAttemptAnsweredAt.current ||= new Date().toISOString(),
        });
      } else {
        await recordAnswer({
          answer,
          correct,
          mistakes: correct ? 0 : 1,
          usedGuide: false,
          firstTryCorrect: correct && mistakes === 0,
        });
      }
      setMistakes(nextMistakes);
      if (correct) setAnsweredQuestion(question);
      setResult(correct ? "correct" : "incorrect");
      setFeedback(correct
        ? `そのとおり！ 「${question.word}」は「${question.reading}」と読むよ。`
        : `おしい。文の中の「${question.word}」の読みをもう一度考えてみよう。`);
    } catch {
      setResult("incorrect");
      setFeedback("保存できませんでした。もう一度、回答するを押してね");
    } finally {
      setSaving(false);
    }
  };

  const nextQuestion = () => {
    setAnswer("");
    setMistakes(0);
    setAnsweredQuestion(null);
    resetFeedback();
  };

  const nextBatch = async () => {
    try {
      await startNext();
      nextQuestion();
    } catch {
      // The session hook exposes a child-friendly error state.
    }
  };

  if ((!freeQuestion && (loading || error)) || (!question && !completed)) {
    return (
      <div className="app-shell">
        <PracticeHeader mode="reading" progress={0} onHome={onHome} onReading={() => undefined} onWriting={onWriting} onSettings={onSettings} onBrowse={onFreePracticeList} />
        <main className="content-loading"><strong>{loading ? "今日の読み問題を準備しています…" : error || "出題できる読み問題がありません"}</strong>{!loading && !error && <span>未習漢字の設定を確認してください。</span>}</main>
      </div>
    );
  }

  if (completed && result !== "correct") {
    return (
      <div className="app-shell">
        <PracticeHeader mode="reading" progress={100} onHome={onHome} onReading={() => undefined} onWriting={onWriting} onSettings={onSettings} />
        <main className="content-loading practice-complete"><strong>読みの学習、おつかれさま！</strong><span>{questionCount}問できました</span><div className="completion-summary"><span>一回で正解<strong>{summary?.firstTryCorrect ?? 0}</strong></span><span>やり直して正解<strong>{summary?.correctedAfterMistake ?? 0}</strong></span><span>分からない<strong>{summary?.unknown ?? 0}</strong></span></div><button className="start-button" type="button" onClick={() => void nextBatch()}>もう10問</button><button type="button" onClick={onHome}>ホームへ</button></main>
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="app-shell reading-shell">
      <PracticeHeader mode="reading" progress={progress} onHome={onHome} onReading={() => undefined} onWriting={onWriting} onSettings={onSettings} onBrowse={onFreePracticeList} />
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
            <span>● {questionIndex + 1} / {questionCount}問</span>
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
          {result === "correct"
            ? <button className="reading-submit next" type="button" onClick={freeQuestion ? onFreePracticeNext : nextQuestion}>{freeQuestion ? (freeQuestionNumber < freeQuestionCount ? "次へ" : "練習を終える") : "次へ"}</button>
            : <button className="reading-submit" type="button" disabled={saving} onClick={() => void submit()}>{saving ? "保存中…" : "回答する"}</button>}
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
  onBrowse?: () => void;
};

export function PracticeHeader({ mode, progress, onHome, onReading, onWriting, onSettings, onBrowse }: HeaderProps) {
  return (
    <header className="topbar practice-topbar">
      <button className="brand brand-button" type="button" onClick={onHome}><span className="brand-mark">学</span><span>おさらいノート</span></button>
      <div className="practice-mode-switch" aria-label="問題形式">
        <button type="button" aria-pressed={mode === "reading"} onClick={onReading}>読み</button>
        <button type="button" aria-pressed={mode === "writing"} onClick={onWriting}>書き</button>
      </div>
      <div className="practice-header-end">
        <div className="practice-progress"><span className="practice-progress-fill" style={{ width: `${progress}%` }} /></div>
        {onBrowse && <button className="compact-header-button" type="button" onClick={onBrowse}>問題一覧</button>}
        <button className="compact-header-button" type="button" onClick={onHome}>ホーム</button>
        <button className="compact-header-button" type="button" onClick={onSettings}>設定</button>
      </div>
    </header>
  );
}
