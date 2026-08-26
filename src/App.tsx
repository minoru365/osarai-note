import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HanziWriter from "hanzi-writer";
import {
  loadKanjiQuestions,
  getWritingReadingParts,
  findPairedQuestion,
  type KanjiQuestion,
  type KanjiReadingQuestion,
  type KanjiWritingQuestion,
} from "./contentPack";
import { startNextDailyBatch, summarizeDailySession } from "./dailySession";
import { japaneseCharDataLoader } from "./kanjiData";
import { loadUnitQuestions, type UnitQuestion } from "./unitContent";
import type { UnitCategory } from "./units";
import { UnitPractice } from "./UnitPractice";
import { Achievements } from "./Achievements";
import { Home } from "./Home";
import { FreePracticeBrowser, createFreePracticeBatch, filterFreePracticeQuestions } from "./FreePracticeBrowser";
import { KanjiModeChoice } from "./KanjiModeChoice";
import { KanjiSettings } from "./KanjiSettings";
import { PracticeHeader, ReadingPractice } from "./ReadingPractice";
import {
  completeCurrentCharacter,
  createWordProgress,
  isWordComplete,
  type WordProgress,
} from "./quizModel";
import { useDailyKanjiSession } from "./useDailyKanjiSession";
import { createId } from "./id";
import { studyStorage } from "./storage/indexedDb";

type QuizState = "loading" | "writing" | "guide" | "character-complete" | "word-complete" | "saving" | "save-error" | "error";

function App() {
  const [view, setView] = useState<"home" | "reading" | "writing" | "kanji-settings" | "free-practice" | "achievements" | "units" | "kanji-mode">("home");
  /** Which kanji the pending mode choice is for; empty object means today's batch. */
  const [modeChoice, setModeChoice] = useState<{ kanji?: string } | null>(null);
  /** Restricts a units batch to one category, e.g. from がんばり記録. */
  const [unitCategory, setUnitCategory] = useState<UnitCategory | null>(null);
  const [unitQuestions, setUnitQuestions] = useState<UnitQuestion[]>([]);
  const [freePracticeQuestion, setFreePracticeQuestion] = useState<KanjiQuestion | null>(null);
  const [freePracticeQueue, setFreePracticeQueue] = useState<KanjiQuestion[]>([]);
  const [freePracticeIndex, setFreePracticeIndex] = useState(0);
  const dailyStartPendingRef = useRef(false);
  const freeWritingAttemptIdRef = useRef(createId());
  const freeWritingAnsweredAtRef = useRef("");
  const [words, setWords] = useState<KanjiQuestion[]>([]);
  const readingQuestions = useMemo(
    () => words.filter((question): question is KanjiReadingQuestion => question.mode === "reading"),
    [words],
  );
  const writingQuestions = useMemo(
    () => words.filter((question): question is KanjiWritingQuestion => question.mode === "writing"),
    [words],
  );
  const [contentError, setContentError] = useState("");
  const {
    session: writingSession,
    currentQuestion: pendingWritingQuestion,
    loading: writingSessionLoading,
    error: writingSessionError,
    recordAnswer: recordWritingAnswer,
    startNext: startNextWritingBatch,
  } = useDailyKanjiSession("writing", writingQuestions, view === "writing" && freePracticeQuestion?.mode !== "writing");
  const [selectedWritingId, setSelectedWritingId] = useState("");
  const selected = freePracticeQuestion?.mode === "writing"
    ? freePracticeQuestion
    : writingQuestions.find((question) => question.id === selectedWritingId);
  const writingReadingParts = selected ? getWritingReadingParts(selected) : null;
  const [progress, setProgress] = useState<WordProgress>(() => createWordProgress(""));
  const [quizState, setQuizState] = useState<QuizState>("loading");
  const [mistakes, setMistakes] = useState(0);
  const [usedGuide, setUsedGuide] = useState(false);
  const [status, setStatus] = useState("ストロークデータを読み込んでいます");
  const writerRef = useRef<HanziWriter | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const guidePenaltyRef = useRef(0);
  const currentCharacter = progress.characters[Math.min(progress.currentIndex, progress.characters.length - 1)] ?? "";
  const completed = progress.characters.length > 0 && isWordComplete(progress);
  const writingComplete = freePracticeQuestion?.mode !== "writing" && Boolean(writingSession?.completedAt);
  const writingQuestionCount = freePracticeQuestion?.mode === "writing" ? freePracticeQueue.length : writingSession?.items.length ?? 0;
  const writingSummary = writingSession ? summarizeDailySession(writingSession) : null;

  useEffect(() => {
    if (view !== "writing" || freePracticeQuestion || selectedWritingId || pendingWritingQuestion?.mode !== "writing") return;
    setSelectedWritingId(pendingWritingQuestion.id);
    setProgress(createWordProgress(pendingWritingQuestion.answerKanji));
  }, [freePracticeQuestion, pendingWritingQuestion, selectedWritingId, view]);

  const goHome = () => {
    setFreePracticeQuestion(null);
    setFreePracticeQueue([]);
    setFreePracticeIndex(0);
    setSelectedWritingId("");
    setView("home");
  };

  const openFreePractice = () => {
    setFreePracticeQuestion(null);
    setFreePracticeQueue([]);
    setFreePracticeIndex(0);
    setSelectedWritingId("");
    setView("free-practice");
  };

  const startDailyPractice = async (mode: "reading" | "writing") => {
    if (dailyStartPendingRef.current) return;
    dailyStartPendingRef.current = true;
    setFreePracticeQuestion(null);
    setFreePracticeQueue([]);
    setFreePracticeIndex(0);
    setSelectedWritingId("");
    const questions = mode === "reading" ? readingQuestions : writingQuestions;
    try {
      await startNextDailyBatch(studyStorage, questions, mode);
    } catch {
      // The session hook retries and exposes a child-friendly error state.
    } finally {
      dailyStartPendingRef.current = false;
      setView(mode);
    }
  };

  const startFreePractice = (question: KanjiQuestion) => {
    setFreePracticeQuestion(question);
    if (question.mode === "writing") {
      freeWritingAttemptIdRef.current = createId();
      freeWritingAnsweredAtRef.current = "";
      setSelectedWritingId(question.id);
      setProgress(createWordProgress(question.answerKanji));
      guidePenaltyRef.current = 0;
      setMistakes(0);
      setUsedGuide(false);
      setQuizState("loading");
    } else setSelectedWritingId("");
    setView(question.mode);
  };

  const startFreePracticeBatch = (questions: KanjiQuestion[]) => {
    if (questions.length === 0) return;
    setFreePracticeQueue(questions);
    setFreePracticeIndex(0);
    startFreePractice(questions[0]);
  };

  const advanceFreePractice = () => {
    const nextIndex = freePracticeIndex + 1;
    const nextBase = freePracticeQueue[nextIndex];
    if (!nextBase) {
      openFreePractice();
      return;
    }
    const mode = freePracticeQuestion?.mode ?? "reading";
    const nextQuestion = findPairedQuestion(words, nextBase, mode) ?? nextBase;
    setFreePracticeIndex(nextIndex);
    startFreePractice(nextQuestion);
  };

  const openModeChoice = (kanji?: string) => {
    setModeChoice({ kanji });
    setView("kanji-mode");
  };

  /**
   * Practises one kanji picked in がんばり記録. Unlearned kanji are filtered out
   * first so a batch never smuggles in a character the child has not met.
   */
  const startKanjiBatchFor = async (kanji: string, mode: "reading" | "writing") => {
    const source = mode === "reading" ? readingQuestions : writingQuestions;
    try {
      const states = new Map((await studyStorage.listKanjiStates()).map((state) => [state.kanji, state]));
      const batch = createFreePracticeBatch(filterFreePracticeQuestions(source, states), createId(), kanji);
      if (batch.length > 0) startFreePracticeBatch(batch);
      else setView("achievements");
    } catch {
      setView("achievements");
    }
  };

  const startQuiz = useCallback((writer: HanziWriter) => {
    setQuizState("writing");
    setStatus("一画ずつ書いてみよう");
    writer.quiz({
      leniency: 1.15,
      acceptBackwardsStrokes: false,
      showHintAfterMisses: 3,
      highlightOnComplete: true,
      onMistake: (data) => {
        setMistakes(guidePenaltyRef.current + data.totalMistakes);
        setStatus(`${data.strokeNum + 1}画目をもう一度。書く向きと位置を見てみよう`);
      },
      onCorrectStroke: (data) => {
        setMistakes(guidePenaltyRef.current + data.totalMistakes);
        setStatus(data.strokesRemaining === 0 ? "最後の画まで書けました" : `いいね。残り${data.strokesRemaining}画`);
      },
      onComplete: (summary) => {
        setMistakes(guidePenaltyRef.current + summary.totalMistakes);
        setQuizState("character-complete");
        setStatus(`${summary.character}を正しい書き順で書けました`);
      },
    });
  }, []);

  useEffect(() => {
    let active = true;
    void loadKanjiQuestions().then(
      (questions) => {
        if (!active) return;
        if (questions.length === 0) {
          setContentError("漢字問題がありません");
          return;
        }
        setWords(questions);
        const firstWritingQuestion = questions.find((question) => question.mode === "writing");
        if (firstWritingQuestion) setProgress(createWordProgress(firstWritingQuestion.answerKanji));
      },
      (error) => {
        if (active) setContentError(error instanceof Error ? error.message : "問題を読み込めませんでした");
      },
    );
    return () => { active = false; };
  }, []);

  // The units pack is optional: a failure here must not block kanji practice.
  useEffect(() => {
    let active = true;
    void loadUnitQuestions().then(
      (questions) => { if (active) setUnitQuestions(questions); },
      () => undefined,
    );
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (view !== "writing" || !selected || !currentCharacter || !targetRef.current || completed) return;

    setQuizState("loading");
    setStatus("ストロークデータを読み込んでいます");
    targetRef.current.replaceChildren();

    const writer = HanziWriter.create(targetRef.current, currentCharacter, {
      width: 470,
      height: 470,
      padding: 24,
      showCharacter: false,
      showOutline: false,
      renderer: "svg",
      charDataLoader: japaneseCharDataLoader,
      strokeColor: "#295f4b",
      drawingColor: "#26352f",
      highlightColor: "#e2a33c",
      highlightCompleteColor: "#3c8b6b",
      drawingWidth: 13,
      strokeWidth: 4,
      onLoadCharDataSuccess: () => startQuiz(writer),
      onLoadCharDataError: (error) => {
        setQuizState("error");
        setStatus(`データを読み込めませんでした: ${String(error)}`);
      },
    });

    writerRef.current = writer;
    return () => {
      writer.cancelQuiz();
      writerRef.current = null;
    };
  }, [completed, currentCharacter, selected, startQuiz, view]);

  const chooseWord = (nextQuestion: KanjiWritingQuestion) => {
    writerRef.current?.cancelQuiz();
    if (freePracticeQuestion?.mode === "writing") freeWritingAttemptIdRef.current = createId();
    if (freePracticeQuestion?.mode === "writing") freeWritingAnsweredAtRef.current = "";
    setSelectedWritingId(nextQuestion.id);
    setProgress(createWordProgress(nextQuestion.answerKanji));
    guidePenaltyRef.current = 0;
    setMistakes(0);
    setUsedGuide(false);
    setQuizState("loading");
  };

  const resetCharacter = () => {
    const writer = writerRef.current;
    if (!writer) return;
    writer.cancelQuiz();
    guidePenaltyRef.current = 0;
    setMistakes(0);
    setUsedGuide(false);
    startQuiz(writer);
  };

  const showGuide = async () => {
    const writer = writerRef.current;
    if (!writer) return;
    writer.cancelQuiz();
    guidePenaltyRef.current += 1;
    setMistakes(guidePenaltyRef.current);
    setUsedGuide(true);
    setQuizState("guide");
    setStatus("1ミスです。答えと書き順を確認しよう");
    await writer.showCharacter({ duration: 180 });
    await writer.animateCharacter();
  };

  const retryAfterGuide = async () => {
    const writer = writerRef.current;
    if (!writer) return;
    await writer.hideCharacter({ duration: 180 });
    startQuiz(writer);
  };

  const saveWordCompletion = async (finalProgress: WordProgress) => {
    if (!selected) return;
    setQuizState("saving");
    setStatus("できた記録を保存しています");
    try {
      const answerResult = {
        answer: selected.answerKanji,
        correct: true,
        mistakes: finalProgress.results.reduce((total, result) => total + result.mistakes, 0),
        usedGuide: finalProgress.results.some((result) => result.usedGuide),
        firstTryCorrect: finalProgress.results.every((result) => result.mistakes === 0 && !result.usedGuide),
        characterResults: finalProgress.results,
      };
      if (freePracticeQuestion?.mode === "writing") {
        await studyStorage.recordKanjiFreePracticeAttempt({
          id: freeWritingAttemptIdRef.current,
          sessionId: "free-practice",
          questionId: selected.id,
          subject: "kanji",
          mode: "writing",
          targetKanji: selected.targetKanji,
          answeredAt: freeWritingAnsweredAtRef.current ||= new Date().toISOString(),
          ...answerResult,
        });
      } else {
        await recordWritingAnswer(answerResult);
      }
      setQuizState("word-complete");
      setStatus(`${selected.word}を最後まで書けました`);
    } catch {
      setQuizState("save-error");
      setStatus("保存できませんでした。もう一度「次へ」を押してね");
    }
  };

  const continueWord = async () => {
    if (!selected || !currentCharacter) return;
    const nextProgress = completeCurrentCharacter(progress, {
      character: currentCharacter,
      mistakes,
      usedGuide,
    });
    setProgress(nextProgress);
    guidePenaltyRef.current = 0;
    setMistakes(0);
    setUsedGuide(false);

    if (isWordComplete(nextProgress)) {
      await saveWordCompletion(nextProgress);
    } else {
      setQuizState("loading");
    }
  };

  const retrySaveWord = () => void saveWordCompletion(progress);

  const nextWord = () => {
    if (pendingWritingQuestion?.mode === "writing") {
      chooseWord(pendingWritingQuestion);
    } else {
      setSelectedWritingId("");
    }
  };

  const nextWritingBatch = async () => {
    try {
      const next = await startNextWritingBatch();
      const firstId = next?.questionIds[0];
      const first = writingQuestions.find((question) => question.id === firstId);
      if (first) chooseWord(first);
    } catch {
      // The session hook exposes a child-friendly error state.
    }
  };

  const resultSummary = useMemo(
    () => progress.results.map((result) => `${result.character}: ミス${result.mistakes}回${result.usedGuide ? "・見本あり" : ""}`),
    [progress.results],
  );

  if (view === "kanji-settings") {
    return <KanjiSettings onBack={goHome} />;
  }

  if (view === "achievements") {
    return (
      <Achievements
        onBack={goHome}
        onPracticeKanji={openModeChoice}
        onPracticeUnit={(category) => { setUnitCategory(category); setView("units"); }}
      />
    );
  }

  if (view === "kanji-mode") {
    const kanji = modeChoice?.kanji;
    const inMode = (mode: "reading" | "writing") => (kanji
      ? (mode === "reading" ? readingQuestions : writingQuestions).filter((question) => question.targetKanji.includes(kanji))
      : mode === "reading" ? readingQuestions : writingQuestions).length;
    return (
      <KanjiModeChoice
        subject={kanji}
        readingCount={inMode("reading")}
        writingCount={inMode("writing")}
        onBack={kanji ? () => setView("achievements") : goHome}
        onChoose={(mode) => {
          if (kanji) void startKanjiBatchFor(kanji, mode);
          else void startDailyPractice(mode);
        }}
      />
    );
  }

  if (view === "units") {
    // A category picked in がんばり記録 narrows the batch; otherwise all units.
    const pool = unitCategory
      ? unitQuestions.filter((question) => question.unitCategory === unitCategory)
      : unitQuestions;
    return <UnitPractice questions={pool} onHome={() => { setUnitCategory(null); goHome(); }} />;
  }

  if (view === "free-practice") {
    return <FreePracticeBrowser questions={words} onBack={goHome} onStart={startFreePracticeBatch} />;
  }

  if (view === "home") {
    return (
      <Home
        questionCount={words.length}
        readingQuestionCount={readingQuestions.length}
        writingQuestionCount={writingQuestions.length}
        contentError={contentError}
        onStartKanji={() => openModeChoice()}
        onOpenFreePractice={openFreePractice}
        onOpenKanjiSettings={() => setView("kanji-settings")}
        onOpenAchievements={() => setView("achievements")}
        unitQuestionCount={unitQuestions.length}
        onStartUnits={() => { setUnitCategory(null); setView("units"); }}
      />
    );
  }

  if (view === "reading") {
    return (
      <ReadingPractice
        questions={readingQuestions}
        freeQuestion={freePracticeQuestion?.mode === "reading" ? freePracticeQuestion : undefined}
        onFreePracticeList={freePracticeQuestion ? openFreePractice : undefined}
        onFreePracticeNext={freePracticeQuestion ? advanceFreePractice : undefined}
        freeQuestionNumber={freePracticeIndex + 1}
        freeQuestionCount={freePracticeQueue.length}
        onHome={goHome}
      />
    );
  }

  if (view === "writing" && writingComplete && !selectedWritingId) {
    return (
      <div className="app-shell">
        <PracticeHeader mode="writing" progress={100} onHome={goHome} />
        <main className="content-loading practice-complete"><strong>書きの学習、おつかれさま！</strong><span>{writingQuestionCount}問できました</span><div className="completion-summary"><span>一回で正解<strong>{writingSummary?.firstTryCorrect ?? 0}</strong></span><span>やり直して正解<strong>{writingSummary?.correctedAfterMistake ?? 0}</strong></span><span>分からない<strong>{writingSummary?.unknown ?? 0}</strong></span></div><button className="start-button" type="button" onClick={() => void nextWritingBatch()}>もう10問</button><button type="button" onClick={goHome}>ホームへ</button></main>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <div className="brand"><span className="brand-mark">学</span><span>おさらいノート</span></div>
          <div className="spike-label">問題データ</div>
          <button className="header-action" type="button" onClick={() => setView("kanji-settings")}>漢字の設定</button>
        </header>
        <main className="content-loading" role="status">
          <strong>{writingSessionError || contentError || (writingSessionLoading ? "今日の書き問題を準備しています…" : "出題できる書き問題がありません")}</strong>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <PracticeHeader
        mode="writing"
        progress={freePracticeQuestion?.mode === "writing" ? (writingQuestionCount === 0 ? 0 : (freePracticeIndex / writingQuestionCount) * 100) : writingQuestionCount === 0 ? 0 : ((writingSession?.currentIndex ?? 0) / writingQuestionCount) * 100}
        onHome={goHome}
        onBrowse={freePracticeQuestion?.mode === "writing" ? openFreePractice : undefined}
      />

      <main className="workspace">
        <section className="question-card">
          <div>
            <p className="eyebrow">漢字の書き</p>
            <p className="writing-context">
              {selected.promptBefore}{writingReadingParts?.readingBefore}<span>「{writingReadingParts?.answerReading}」</span>{writingReadingParts?.readingAfter}{selected.promptAfter}
            </p>
            <h1>「{writingReadingParts?.answerReading}」の部分を漢字で書こう</h1>
            <p className="reading">読み：{selected.reading}</p>
          </div>

          <div className="character-progress" aria-label="文字の進み具合">
            {progress.characters.map((character, index) => (
              <div
                className={`character-box ${index < progress.currentIndex ? "done" : ""} ${index === progress.currentIndex && !completed ? "current" : ""}`}
                key={`${character}-${index}`}
              >
                {index < progress.currentIndex || (completed && index === progress.characters.length - 1) ? character : ""}
                <span>{index + 1}</span>
              </div>
            ))}
          </div>

          <div className={`status-message ${quizState === "character-complete" || quizState === "word-complete" ? "success" : ""}`} aria-live="polite">
            <span className="status-dot" />
            <span>{status}</span>
          </div>

          {/*
            Only surface mistakes and the guide once they actually happened. A
            standing "ミス 0回" counter reads as pressure, and the plan asks us
            not to dwell on wrong answers while the child is still working.
          */}
          <dl className="live-stats">
            <div><dt>いまの文字</dt><dd>{completed ? "完了" : quizState === "guide" || quizState === "character-complete" ? currentCharacter : `${progress.currentIndex + 1}文字目`}</dd></div>
            {mistakes > 0 && <div className="live-stat-quiet"><dt>ミス</dt><dd>{mistakes}回</dd></div>}
            {usedGuide && <div className="live-stat-quiet"><dt>見本</dt><dd>使用</dd></div>}
          </dl>

          <p className="writing-question-progress">● {freePracticeQuestion?.mode === "writing" ? freePracticeIndex + 1 : Math.min((writingSession?.currentIndex ?? 0) + (quizState === "word-complete" ? 0 : 1), writingQuestionCount)} / {writingQuestionCount}問</p>
        </section>

        <section className="writing-card">
          <div className="writer-heading">
            <div><span>{Math.min(progress.currentIndex + 1, progress.characters.length)}文字目</span><strong>{completed ? selected.word : quizState === "guide" || quizState === "character-complete" ? currentCharacter : "？"}</strong></div>
            <p>枠の中に大きく書こう</p>
          </div>

          <div className="writer-layout">
            <div className="writer-stage">
              <div className="guide-lines" aria-hidden="true" />
              <div ref={targetRef} className="hanzi-target" aria-label="漢字の手書き入力欄" />
              {quizState === "loading" && <div className="stage-overlay">読み込み中…</div>}
              {quizState === "word-complete" && (
                <div className="stage-overlay complete-overlay">
                  <strong>{selected.word}</strong>
                  <span>最後まで書けました</span>
                  {resultSummary.map((result) => <small key={result}>{result}</small>)}
                </div>
              )}
            </div>

            <div className="actions">
              <button type="button" onClick={resetCharacter} disabled={quizState === "loading" || quizState === "word-complete" || quizState === "save-error"}>最初から</button>
              <button type="button" className="help" onClick={showGuide} disabled={quizState === "loading" || quizState === "guide" || quizState === "character-complete" || quizState === "word-complete" || quizState === "save-error"}>分からない</button>
              {quizState === "guide" && <button type="button" className="primary" onClick={retryAfterGuide}>もう一度書く</button>}
              {quizState === "character-complete" && <button type="button" className="primary" onClick={() => void continueWord()}>次へ</button>}
              {quizState === "saving" && <button type="button" className="primary" disabled>保存中…</button>}
              {quizState === "save-error" && <button type="button" className="primary" onClick={retrySaveWord}>次へ</button>}
              {quizState === "word-complete" && freePracticeQuestion?.mode === "writing" && <button type="button" className="primary" onClick={advanceFreePractice}>{freePracticeIndex + 1 < freePracticeQueue.length ? "次へ" : "練習を終える"}</button>}
              {quizState === "word-complete" && !freePracticeQuestion && !writingComplete && <button type="button" className="primary" onClick={nextWord}>次へ</button>}
              {quizState === "word-complete" && writingComplete && <button type="button" className="primary" onClick={() => setSelectedWritingId("")}>結果を見る</button>}
              {quizState === "word-complete" && <button type="button" onClick={() => chooseWord(selected)}>もう一度</button>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
