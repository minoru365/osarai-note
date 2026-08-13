import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HanziWriter from "hanzi-writer";
import {
  loadKanjiQuestions,
  type KanjiQuestion,
  type KanjiReadingQuestion,
  type KanjiWritingQuestion,
} from "./contentPack";
import { createId } from "./id";
import { japaneseCharDataLoader } from "./kanjiData";
import { Home } from "./Home";
import { KanjiSettings } from "./KanjiSettings";
import { PracticeHeader, ReadingPractice } from "./ReadingPractice";
import {
  completeCurrentCharacter,
  createWordProgress,
  isWordComplete,
  type WordProgress,
} from "./quizModel";
import { studyStorage } from "./storage/indexedDb";

type QuizState = "loading" | "writing" | "guide" | "character-complete" | "word-complete" | "error";

function App() {
  const [view, setView] = useState<"home" | "reading" | "writing" | "kanji-settings">("home");
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
  const [wordIndex, setWordIndex] = useState(0);
  const selected = writingQuestions[wordIndex];
  const [progress, setProgress] = useState<WordProgress>(() => createWordProgress(""));
  const [quizState, setQuizState] = useState<QuizState>("loading");
  const [mistakes, setMistakes] = useState(0);
  const [usedGuide, setUsedGuide] = useState(false);
  const [status, setStatus] = useState("ストロークデータを読み込んでいます");
  const writerRef = useRef<HanziWriter | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const guidePenaltyRef = useRef(0);
  const sessionIdRef = useRef(createId());
  const currentCharacter = progress.characters[Math.min(progress.currentIndex, progress.characters.length - 1)] ?? "";
  const completed = progress.characters.length > 0 && isWordComplete(progress);

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
        if (firstWritingQuestion) setProgress(createWordProgress(firstWritingQuestion.word));
      },
      (error) => {
        if (active) setContentError(error instanceof Error ? error.message : "問題を読み込めませんでした");
      },
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

  const chooseWord = (nextIndex: number) => {
    writerRef.current?.cancelQuiz();
    const nextWord = writingQuestions[nextIndex];
    if (!nextWord) return;
    setWordIndex(nextIndex);
    setProgress(createWordProgress(nextWord.word));
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

  const continueWord = () => {
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
      setQuizState("word-complete");
      setStatus(`${selected.word}を最後まで書けました`);
      void studyStorage.saveAttempt({
        id: createId(),
        sessionId: sessionIdRef.current,
        questionId: selected.id,
        subject: "kanji",
        mode: "writing",
        answer: selected.word,
        correct: true,
        mistakes: nextProgress.results.reduce((total, result) => total + result.mistakes, 0),
        usedGuide: nextProgress.results.some((result) => result.usedGuide),
        answeredAt: new Date().toISOString(),
        characterResults: nextProgress.results,
      }).catch(() => undefined);
    } else {
      setQuizState("loading");
    }
  };

  const nextWord = () => {
    if (wordIndex + 1 < writingQuestions.length) chooseWord(wordIndex + 1);
  };

  const resultSummary = useMemo(
    () => progress.results.map((result) => `${result.character}: ミス${result.mistakes}回${result.usedGuide ? "・見本あり" : ""}`),
    [progress.results],
  );

  if (view === "kanji-settings") {
    return <KanjiSettings onBack={() => setView("home")} />;
  }

  if (view === "home") {
    return (
      <Home
        questionCount={words.length}
        contentError={contentError}
        onStartKanji={() => setView(readingQuestions.length > 0 ? "reading" : "writing")}
        onOpenKanjiSettings={() => setView("kanji-settings")}
      />
    );
  }

  if (view === "reading") {
    return (
      <ReadingPractice
        questions={readingQuestions}
        onHome={() => setView("home")}
        onWriting={() => setView("writing")}
        onSettings={() => setView("kanji-settings")}
      />
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
          <strong>{contentError ? "問題を読み込めませんでした" : "問題を読み込んでいます…"}</strong>
          {contentError && <span>{contentError}</span>}
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <PracticeHeader
        mode="writing"
        progress={writingQuestions.length === 0 ? 0 : ((wordIndex + 1) / writingQuestions.length) * 100}
        onHome={() => setView("home")}
        onReading={() => setView("reading")}
        onWriting={() => undefined}
        onSettings={() => setView("kanji-settings")}
      />

      <main className="workspace">
        <section className="question-card">
          <div>
            <p className="eyebrow">漢字の書き</p>
            <h1>{selected.prompt}</h1>
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

          <dl className="live-stats">
            <div><dt>いまの文字</dt><dd>{completed ? "完了" : quizState === "guide" || quizState === "character-complete" ? currentCharacter : `${progress.currentIndex + 1}文字目`}</dd></div>
            <div><dt>ミス</dt><dd>{mistakes}回</dd></div>
            <div><dt>見本</dt><dd>{usedGuide ? "使用" : "未使用"}</dd></div>
          </dl>

          <p className="writing-question-progress">● {wordIndex + 1} / {writingQuestions.length}問</p>
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
              <button type="button" onClick={resetCharacter} disabled={quizState === "loading" || quizState === "word-complete"}>最初から</button>
              <button type="button" className="help" onClick={showGuide} disabled={quizState === "loading" || quizState === "guide" || quizState === "character-complete" || quizState === "word-complete"}>分からない</button>
              {quizState === "guide" && <button type="button" className="primary" onClick={retryAfterGuide}>もう一度書く</button>}
              {quizState === "character-complete" && <button type="button" className="primary" onClick={continueWord}>次へ</button>}
              {quizState === "word-complete" && wordIndex + 1 < writingQuestions.length && <button type="button" className="primary" onClick={nextWord}>次へ</button>}
              {quizState === "word-complete" && <button type="button" onClick={() => chooseWord(wordIndex)}>もう一度</button>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
