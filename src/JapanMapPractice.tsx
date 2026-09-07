import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createId } from "./id";
import { getLocalDate } from "./dailySession";
import {
  createJapanMapAnswerState,
  hideJapanMapAnswer,
  revealJapanMapAnswer,
  submitJapanMapAnswer,
  type JapanMapAnswerState,
} from "./japanMapQuizModel";
import { JapanMapSvg } from "./JapanMapSvg";
import { startNextJapanMapBatch, summarizeJapanMapSession } from "./japanMapSession";
import { studyStorage } from "./storage/indexedDb";
import { isJapanMapSession, type JapanMapSessionAttempt } from "./storage/schema";
import type { JapanMapPrefectureId, JapanMapQuestion } from "./japanMapContent";

type Props = {
  questions: JapanMapQuestion[];
  onHome: () => void;
};

export function JapanMapPractice({ questions, onHome }: Props) {
  const [session, setSession] = useState<Awaited<ReturnType<typeof startNextJapanMapBatch>>>(null);
  const [answerState, setAnswerState] = useState<JapanMapAnswerState>(createJapanMapAnswerState);
  const [answeredQuestion, setAnsweredQuestion] = useState<JapanMapQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const startedRef = useRef(false);
  const questionMap = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);

  const start = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await startNextJapanMapBatch(studyStorage, questions, getLocalDate());
      if (!next) setError("出せる地図問題がありません。4年生を選んでいるか確認してください。");
      setSession(next);
      setAnswerState(createJapanMapAnswerState());
      setAnsweredQuestion(null);
      setFeedback("");
    } catch {
      setError("地図問題を準備できませんでした");
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
  const question = answerState.solved ? answeredQuestion ?? pendingQuestion : pendingQuestion;
  const complete = Boolean(session?.completedAt) && !answerState.solved;
  const answeredIndex = Math.max(0, (session?.currentIndex ?? 0) - (answerState.solved ? 1 : 0));
  const summary = session ? summarizeJapanMapSession(session) : null;

  const record = async (input: Pick<JapanMapSessionAttempt, "answer" | "correct" | "mistakes" | "usedGuide" | "firstTryCorrect">) => {
    if (!session || !item) throw new Error("問題がありません");
    const attempt: JapanMapSessionAttempt = {
      id: createId(),
      sessionId: session.id,
      sessionItemId: item.id,
      questionId: item.questionId,
      subject: "japan-map",
      mode: "quiz",
      answeredAt: new Date().toISOString(),
      ...input,
    };
    await studyStorage.recordJapanMapSessionAttempt(attempt);
    const updated = await studyStorage.getDailySession(session.id);
    if (!updated || !isJapanMapSession(updated)) throw new Error("進み具合を読み込めませんでした");
    setSession(updated);
  };

  const submit = async (prefectureId: string) => {
    if (!question || !item || saving || answerState.solved || answerState.revealed) return;
    const correct = question.prefectureId === prefectureId;
    setSaving(true);
    try {
      await record({
        answer: prefectureId,
        correct,
        mistakes: correct ? 0 : 1,
        usedGuide: false,
        firstTryCorrect: correct && answerState.mistakes === 0 && !answerState.usedGuide,
      });
      if (correct) setAnsweredQuestion(question);
      setAnswerState((current) => submitJapanMapAnswer(current, question.prefectureId, prefectureId));
      setFeedback(correct ? "せいかい！" : "ちがうよ。もう一度、地図を見てみよう。");
    } catch {
      setFeedback("保存できませんでした。もう一度おしてね。");
    } finally {
      setSaving(false);
    }
  };

  const reveal = async () => {
    if (!question || saving || answerState.solved || answerState.revealed) return;
    setSaving(true);
    try {
      await record({
        answer: "",
        correct: false,
        mistakes: answerState.usedGuide ? 0 : 1,
        usedGuide: true,
        firstTryCorrect: false,
      });
      setAnswerState((current) => revealJapanMapAnswer(current));
      setFeedback("答えの場所を見てから、もう一度おしてみよう。");
    } catch {
      setFeedback("保存できませんでした。もう一度おしてね。");
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    setAnswerState(createJapanMapAnswerState());
    setAnsweredQuestion(null);
    setFeedback("");
  };

  if (loading) return <MapShell onHome={onHome}><div className="content-loading">じゅんびしています…</div></MapShell>;
  if (error || !session) {
    return <MapShell onHome={onHome}><div className="content-loading"><strong>{error || "問題がありません"}</strong><button type="button" onClick={onHome}>ホームへ</button></div></MapShell>;
  }
  if (complete || !question) {
    return (
      <MapShell onHome={onHome} progress={`${session.items.length} / ${session.items.length}`}>
        <main className="content-loading practice-complete">
          <strong>日本地図の学習、おつかれさま！</strong>
          <span>{session.items.length}問できました</span>
          <div className="completion-summary">
            <span>一回で正解<strong>{summary?.firstTryCorrect ?? 0}</strong></span>
            <span>やり直して正解<strong>{summary?.correctedAfterMistake ?? 0}</strong></span>
            <span>分からない<strong>{summary?.unknown ?? 0}</strong></span>
          </div>
          <button className="start-button" type="button" onClick={() => void start()}>もう10問</button>
          <button type="button" onClick={onHome}>ホームへ</button>
        </main>
      </MapShell>
    );
  }

  const solved = answerState.solved;
  const mapCorrectId = answerState.revealed || solved ? question.prefectureId : null;

  return (
    <MapShell onHome={onHome} progress={`${answeredIndex + 1} / ${session.items.length}`}>
      <main className="japan-map-workspace">
        <section className="japan-map-question-card">
          <p className="eyebrow">{answeredIndex + 1}問目</p>
          <h1 className="japan-map-prompt">{question.prompt}</h1>
          <p className="japan-map-hint">地図の都道府県をおしてね。</p>
          {feedback && !solved && <p className={`japan-map-feedback ${answerState.revealed ? "guide" : "incorrect"}`} role="status">{feedback}</p>}
          {answerState.revealed && (
            <div className="japan-map-reveal" role="status">
              <strong>こたえ：{question.answer}</strong>
              <p>{question.explanation}</p>
              <button type="button" onClick={() => setAnswerState(hideJapanMapAnswer)}>地図をかくす</button>
            </div>
          )}
          {solved && (
            <div className="japan-map-solved" role="status">
              <strong>せいかい！</strong>
              <p>{question.explanation}</p>
            </div>
          )}
        </section>
        <section className="japan-map-answer">
          <JapanMapSvg
            selectedId={answerState.selectedId as JapanMapPrefectureId | null}
            correctId={mapCorrectId}
            onSelect={(id) => void submit(id)}
          />
          <div className="japan-map-actions">
            {!solved && !answerState.revealed && <button type="button" disabled={saving} onClick={() => void reveal()}>分からない</button>}
            {answerState.revealed && <button type="button" disabled={saving} onClick={() => setAnswerState(hideJapanMapAnswer)}>もう一度答える</button>}
            <button className="primary" type="button" disabled={!solved} onClick={next}>次へ</button>
          </div>
        </section>
      </main>
    </MapShell>
  );
}

function MapShell({ children, onHome, progress }: { children: ReactNode; onHome: () => void; progress?: string }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={onHome}><span className="brand-mark">学</span><span>おさらいノート</span></button>
        <div className="spike-label">日本地図</div>
        <div className="practice-header-end">{progress && <div className="question-progress">{progress}</div>}<button className="compact-header-button" type="button" onClick={onHome}>ホーム</button></div>
      </header>
      {children}
    </div>
  );
}
