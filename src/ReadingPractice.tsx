import { useEffect, useRef, useState } from "react";
import { getKanjiAnswerParts, type KanjiReadingQuestion } from "./contentPack";
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
  freeQuestion?: KanjiReadingQuestion;
  onFreePracticeList?: () => void;
  onFreePracticeNext?: () => void;
  freeQuestionNumber?: number;
  freeQuestionCount?: number;
};

export function ReadingPractice({ questions, onHome, freeQuestion, onFreePracticeList, onFreePracticeNext, freeQuestionNumber = 1, freeQuestionCount = 1 }: Props) {
  const [answer, setAnswer] = useState("");
  const [mistakes, setMistakes] = useState(0);
  const [result, setResult] = useState<"input" | "correct" | "incorrect" | "guide">("input");
  const [feedback, setFeedback] = useState("漢字の部分だけを入力してね");
  const [saving, setSaving] = useState(false);
  const [usedGuide, setUsedGuide] = useState(false);
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
    setUsedGuide(false);
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
  const answerParts = question ? getKanjiAnswerParts(question) : null;

  const resetFeedback = () => {
    setResult("input");
    setFeedback("漢字の部分だけを入力してね");
  };

  const appendKana = (character: string) => {
    if ((result !== "input" && result !== "incorrect") || character === "・" || Array.from(answer).length >= 12) return;
    setAnswer((current) => current + character);
    resetFeedback();
  };

  const modify = (operation: (value: string) => string) => {
    if (result !== "input" && result !== "incorrect") return;
    setAnswer(operation);
    resetFeedback();
  };

  const submit = async () => {
    if (!question || !answer) {
      setResult("incorrect");
      setFeedback("50音表から読みを入力してね");
      return;
    }
    const currentParts = getKanjiAnswerParts(question);
    const correct = isCorrectReading(answer, currentParts.answerReading);
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
          usedGuide,
          firstTryCorrect: mistakes === 0,
          targetKanji: freeQuestion.targetKanji,
          answeredAt: freeAttemptAnsweredAt.current ||= new Date().toISOString(),
        });
      } else {
        await recordAnswer({
          answer,
          correct,
          mistakes: correct ? 0 : 1,
          usedGuide,
          firstTryCorrect: correct && mistakes === 0,
        });
      }
      setMistakes(nextMistakes);
      if (correct) setAnsweredQuestion(question);
      setResult(correct ? "correct" : "incorrect");
      setFeedback(correct
        ? `そのとおり！ 「${currentParts.answerKanji}」の部分は「${currentParts.answerReading}」と読むよ。`
        : `おしい。文の中の「${currentParts.answerKanji}」の読みをもう一度考えてみよう。`);
    } catch {
      setResult("incorrect");
      setFeedback("保存できませんでした。もう一度、回答するを押してね");
    } finally {
      setSaving(false);
    }
  };

  const showAnswer = async () => {
    if (!question || !answerParts || saving || result === "correct" || result === "guide") return;
    setSaving(true);
    try {
      if (!freeQuestion) {
        await recordAnswer({
          answer: "",
          correct: false,
          mistakes: 1,
          usedGuide: true,
          firstTryCorrect: false,
        });
      }
      setAnswer("");
      setMistakes((current) => current + 1);
      setUsedGuide(true);
      setResult("guide");
      setFeedback(`答えは「${answerParts.answerReading}」。よく見たら、答えをかくしてもう一度入力しよう。`);
    } catch {
      setResult("incorrect");
      setFeedback("保存できませんでした。もう一度「分からない」を押してね");
    } finally {
      setSaving(false);
    }
  };

  const retryAfterGuide = () => {
    setAnswer("");
    setResult("input");
    setFeedback("漢字の部分だけを、もう一度入力してね");
  };

  const nextQuestion = () => {
    setAnswer("");
    setMistakes(0);
    setUsedGuide(false);
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
        <PracticeHeader mode="reading" progress={0} onHome={onHome} onBrowse={onFreePracticeList} />
        <main className="content-loading"><strong>{loading ? "今日の読み問題を準備しています…" : error || "出題できる読み問題がありません"}</strong>{!loading && !error && <span>未習漢字の設定を確認してください。</span>}</main>
      </div>
    );
  }

  if (completed && result !== "correct") {
    return (
      <div className="app-shell">
        <PracticeHeader mode="reading" progress={100} onHome={onHome} />
        <main className="content-loading practice-complete"><strong>読みの学習、おつかれさま！</strong><span>{questionCount}問できました</span><div className="completion-summary"><span>一回で正解<strong>{summary?.firstTryCorrect ?? 0}</strong></span><span>やり直して正解<strong>{summary?.correctedAfterMistake ?? 0}</strong></span><span>分からない<strong>{summary?.unknown ?? 0}</strong></span></div><button className="start-button" type="button" onClick={() => void nextBatch()}>もう10問</button><button type="button" onClick={onHome}>ホームへ</button></main>
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="app-shell reading-shell">
      <PracticeHeader mode="reading" progress={progress} onHome={onHome} onBrowse={onFreePracticeList} />
      <main className="reading-workspace">
        <section className="reading-question-card">
          <p className="eyebrow">漢字の読み</p>
          <p className="reading-prompt">
            {question.promptBefore}{answerParts?.wordBefore}<span className="reading-target">{answerParts?.answerKanji}</span>{answerParts?.wordAfter}{question.promptAfter}
          </p>
          <div className={`reading-answer ${result === "correct" ? "correct" : result === "incorrect" ? "incorrect" : result === "guide" ? "guide" : ""}`} aria-live="polite">
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
              <button type="button" disabled={result === "guide" || result === "correct"} onClick={() => modify(toggleSmallKana)}>小文字</button>
              <button className="kana-mark-button" type="button" disabled={result === "guide" || result === "correct"} aria-label="濁音" onClick={() => modify(applyDakuten)}><span aria-hidden="true">゛</span><small>濁音</small></button>
              <button className="kana-mark-button" type="button" disabled={result === "guide" || result === "correct"} aria-label="半濁音" onClick={() => modify(applyHandakuten)}><span aria-hidden="true">゜</span><small>半濁音</small></button>
              <button type="button" disabled={result === "guide" || result === "correct"} onClick={() => modify(deleteLastKana)}>一字消す</button>
              <button type="button" disabled={result === "guide" || result === "correct"} onClick={() => { setAnswer(""); resetFeedback(); }}>全部消す</button>
            </div>
          </div>
          <div className="kana-grid">
            {HIRAGANA_GRID.map((character, index) => (
              <button
                type="button"
                disabled={character === "・" || result === "correct" || result === "guide"}
                onClick={() => appendKana(character)}
                key={`${character}-${index}`}
              >{character === "・" ? "" : character}</button>
            ))}
          </div>
          {result === "correct"
            ? <button className="reading-submit next" type="button" onClick={freeQuestion ? onFreePracticeNext : nextQuestion}>{freeQuestion ? (freeQuestionNumber < freeQuestionCount ? "次へ" : "練習を終える") : "次へ"}</button>
            : result === "guide"
              ? <button className="reading-submit" type="button" onClick={retryAfterGuide}>答えをかくして、もう一度</button>
              : <div className="reading-actions">
                <button className="reading-submit" type="button" disabled={saving} onClick={() => void submit()}>{saving ? "保存中…" : "回答する"}</button>
                <button className="reading-unknown" type="button" disabled={saving} onClick={() => void showAnswer()}>分からない</button>
              </div>}
        </section>
      </main>
    </div>
  );
}

type HeaderProps = {
  mode: "reading" | "writing";
  progress: number;
  onHome: () => void;
  onBrowse?: () => void;
};

/**
 * The reading/writing choice is made before a batch starts, so the header only
 * labels the current form. Switching mid-batch is deliberately not offered.
 */
export function PracticeHeader({ mode, progress, onHome, onBrowse }: HeaderProps) {
  return (
    <header className="topbar practice-topbar">
      <button className="brand brand-button" type="button" onClick={onHome}><span className="brand-mark">学</span><span>おさらいノート</span></button>
      <div className="spike-label">{mode === "reading" ? "漢字の読み" : "漢字の書き"}</div>
      <div className="practice-header-end">
        <div className="practice-progress"><span className="practice-progress-fill" style={{ width: `${progress}%` }} /></div>
        {onBrowse && <button className="compact-header-button" type="button" onClick={onBrowse}>問題一覧</button>}
        <button className="compact-header-button" type="button" onClick={onHome}>ホーム</button>
      </div>
    </header>
  );
}
