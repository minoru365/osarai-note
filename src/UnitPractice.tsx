import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NumberPad } from "./NumberPad";
import { createId } from "./id";
import { getLocalDate } from "./dailySession";
import { studyStorage } from "./storage/indexedDb";
import { formatExpectedAnswer, type UnitQuestion } from "./unitContent";
import { getUnit } from "./units";
import {
  canAdvance,
  createUnitAnswerState,
  hideUnitAnswer,
  revealUnitAnswer,
  submitUnitAnswer,
  toAttemptInput,
  toRevealAttemptInput,
  type UnitAttemptInput,
} from "./unitQuizModel";
import { startNextUnitBatch, summarizeUnitSession } from "./unitSession";
import { isUnitSession, type DailyUnitSession } from "./storage/schema";

type Props = {
  questions: UnitQuestion[];
  onHome: () => void;
};

export function UnitPractice({ questions, onHome }: Props) {
  const [session, setSession] = useState<DailyUnitSession | null>(null);
  const [answerState, setAnswerState] = useState(createUnitAnswerState);
  const [answeredQuestion, setAnsweredQuestion] = useState<UnitQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const startedRef = useRef(false);
  const questionMap = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions],
  );

  const start = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await startNextUnitBatch(studyStorage, questions, getLocalDate());
      if (!next) {
        setError("出せる問題がありません。保護者設定で習った単位を確認してください。");
      }
      setSession(next);
      setAnswerState(createUnitAnswerState());
      setAnsweredQuestion(null);
      setFeedback("");
    } catch {
      setError("単位の問題を準備できませんでした");
    } finally {
      setLoading(false);
    }
  }, [questions]);

  useEffect(() => {
    if (startedRef.current || questions.length === 0) return;
    startedRef.current = true;
    void start();
  }, [questions.length, start]);

  const item = session?.items[session.currentIndex];
  const pendingQuestion = item ? questionMap.get(item.questionId) : undefined;
  // A correct answer advances the stored session immediately, so hold on to the
  // question just answered until 次へ, as the kanji screens do.
  const question = answerState.solved ? answeredQuestion ?? pendingQuestion : pendingQuestion;
  const complete = Boolean(session?.completedAt) && !answerState.solved;
  const answeredIndex = Math.max(0, (session?.currentIndex ?? 0) - (answerState.solved ? 1 : 0));
  const summary = session ? summarizeUnitSession(session) : null;

  const persist = async (input: UnitAttemptInput) => {
    if (!session || !item) throw new Error("問題がありません");
    await studyStorage.recordUnitSessionAttempt({
      id: createId(),
      sessionId: session.id,
      sessionItemId: item.id,
      questionId: item.questionId,
      subject: "units",
      mode: "quiz",
      unitStateKey: item.unitStateKey,
      answeredAt: new Date().toISOString(),
      ...input,
    });
    const updated = await studyStorage.getDailySession(session.id);
    if (!updated || !isUnitSession(updated)) throw new Error("進み具合を読み込めませんでした");
    setSession(updated);
  };

  const submit = async (answer: string) => {
    if (!question || saving || answerState.solved || answerState.revealed) return;
    setSaving(true);
    try {
      const input = toAttemptInput(answerState, question, answer);
      await persist(input);
      if (input.correct) setAnsweredQuestion(question);
      setAnswerState((current) => submitUnitAnswer(current, question, answer));
      setFeedback(input.correct ? "せいかい！" : "おしい。もう一度やってみよう。");
    } catch {
      setFeedback("保存できませんでした。もう一度こたえてね。");
    } finally {
      setSaving(false);
    }
  };

  const reveal = async () => {
    if (!question || saving || answerState.solved || answerState.revealed) return;
    setSaving(true);
    try {
      await persist(toRevealAttemptInput(answerState));
      setAnswerState((current) => revealUnitAnswer(current));
      setFeedback("");
    } catch {
      setFeedback("保存できませんでした。もう一度おしてね。");
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    setAnswerState(createUnitAnswerState());
    setAnsweredQuestion(null);
    setFeedback("");
  };

  if (loading) {
    return <Shell onHome={onHome}><div className="content-loading">じゅんびしています…</div></Shell>;
  }

  if (error || !session) {
    return (
      <Shell onHome={onHome}>
        <div className="content-loading">
          <strong>{error || "問題がありません"}</strong>
          <button type="button" onClick={onHome}>ホームへ</button>
        </div>
      </Shell>
    );
  }

  // `item` is already undefined once the last answer advanced the session, so
  // the held question keeps the final せいかい visible until 次へ.
  if (complete || !question) {
    return (
      <Shell onHome={onHome}>
        <main className="content-loading practice-complete">
          <strong>単位の学習、おつかれさま！</strong>
          <span>{session.items.length}問できました</span>
          <div className="completion-summary">
            <span>一回で正解<strong>{summary?.firstTryCorrect ?? 0}</strong></span>
            <span>やり直して正解<strong>{summary?.correctedAfterMistake ?? 0}</strong></span>
            <span>分からない<strong>{summary?.unknown ?? 0}</strong></span>
          </div>
          <button className="start-button" type="button" onClick={() => void start()}>もう10問</button>
          <button type="button" onClick={onHome}>ホームへ</button>
        </main>
      </Shell>
    );
  }

  const solved = canAdvance(answerState);

  return (
    <Shell onHome={onHome} progress={`${answeredIndex + 1} / ${session.items.length}`}>
      <main className="unit-workspace">
        <section className="unit-card">
          <p className="eyebrow">{answeredIndex + 1}問目</p>
          <h1 className="unit-prompt">{question.prompt}</h1>

          {answerState.revealed && (
            <div className="unit-reveal" role="status">
              <strong>
                こたえ：
                {question.answerType === "numeric"
                  ? `${formatExpectedAnswer(question)}${getUnit(question.answerUnit).label}`
                  : question.choices.find((choice) => choice.id === question.answerChoiceId)?.label}
              </strong>
              <p>{question.explanation}</p>
              <button type="button" onClick={() => setAnswerState(hideUnitAnswer)}>
                かくして じぶんでこたえる
              </button>
            </div>
          )}

          {!answerState.revealed && solved && (
            <div className="unit-solved" role="status">
              <strong>せいかい！</strong>
              <p>{question.explanation}</p>
            </div>
          )}

          {!answerState.revealed && !solved && feedback && (
            <p className="unit-feedback" role="status">{feedback}</p>
          )}
        </section>

        <section className="unit-answer">
          {question.answerType === "numeric" ? (
            <>
              <div className="unit-entry" aria-label="こたえ">
                <span>{answerState.entry || "　"}</span>
                <em>{getUnit(question.answerUnit).label}</em>
              </div>
              <NumberPad
                value={answerState.entry}
                onChange={(entry) => setAnswerState((current) => ({ ...current, entry }))}
                onSubmit={() => void submit(answerState.entry)}
                disabled={saving || solved || answerState.revealed}
              />
            </>
          ) : (
            <div className="unit-choices">
              {question.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  disabled={saving || solved || answerState.revealed}
                  onClick={() => void submit(choice.id)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          )}

          <div className="unit-actions">
            <button
              className="reading-unknown"
              type="button"
              disabled={saving || solved || answerState.revealed}
              onClick={() => void reveal()}
            >
              分からない
            </button>
            <button
              className="reading-submit next"
              type="button"
              disabled={!solved}
              onClick={next}
            >
              次へ
            </button>
          </div>
        </section>
      </main>
    </Shell>
  );
}

function Shell({ children, onHome, progress }: {
  children: ReactNode;
  onHome: () => void;
  progress?: string;
}) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={onHome}>
          <span className="brand-mark">学</span><span>おさらいノート</span>
        </button>
        <div className="spike-label">たんい</div>
        {/* Home stays reachable mid-batch; progress sits beside it, not instead of it. */}
        <div className="practice-header-end">
          {progress && <div className="question-progress">{progress}</div>}
          <button className="compact-header-button" type="button" onClick={onHome}>ホーム</button>
        </div>
      </header>
      {children}
    </div>
  );
}
