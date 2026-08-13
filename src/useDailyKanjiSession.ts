import { useCallback, useEffect, useMemo, useState } from "react";
import type { KanjiQuestion } from "./contentPack";
import { getOrCreateDailySession, startNextDailyBatch } from "./dailySession";
import { createId } from "./id";
import { studyStorage } from "./storage/indexedDb";
import type {
  CharacterAttemptResult,
  DailyKanjiSession,
  KanjiSessionAttempt,
  KanjiStudyMode,
} from "./storage/schema";

type AnswerInput = {
  answer: string;
  correct: boolean;
  mistakes: number;
  usedGuide: boolean;
  firstTryCorrect: boolean;
  characterResults?: CharacterAttemptResult[];
};

export function useDailyKanjiSession(
  mode: KanjiStudyMode,
  questions: KanjiQuestion[],
  enabled = true,
) {
  const [session, setSession] = useState<DailyKanjiSession | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const questionMap = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSession(await getOrCreateDailySession(studyStorage, questions, mode));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "今日の問題を準備できませんでした");
    } finally {
      setLoading(false);
    }
  }, [mode, questions]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  const currentItem = session?.items[session.currentIndex];
  const currentQuestion = currentItem ? questionMap.get(currentItem.questionId) : undefined;

  const recordAnswer = useCallback(async (input: AnswerInput) => {
    if (!session) throw new Error("今日の学習セットがありません");
    const item = session.items[session.currentIndex];
    const question = item ? questionMap.get(item.questionId) : undefined;
    if (!item || !question) throw new Error("現在の問題が見つかりません");
    const attempt: KanjiSessionAttempt = {
      id: createId(),
      sessionId: session.id,
      sessionItemId: item.id,
      questionId: question.id,
      subject: "kanji",
      mode,
      targetKanji: question.targetKanji,
      answeredAt: new Date().toISOString(),
      ...input,
    };
    await studyStorage.recordKanjiSessionAttempt(attempt);
    const updated = await studyStorage.getDailySession(session.id);
    if (!updated) throw new Error("学習の進み具合を読み込めませんでした");
    setSession(updated);
    return updated;
  }, [mode, questionMap, session]);

  const startNext = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await startNextDailyBatch(studyStorage, questions, mode);
      setSession(next);
      return next;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "次の問題を準備できませんでした";
      setError(message);
      throw cause;
    } finally {
      setLoading(false);
    }
  }, [mode, questions]);

  return {
    session,
    currentQuestion,
    loading,
    error,
    recordAnswer,
    startNext,
  };
}
