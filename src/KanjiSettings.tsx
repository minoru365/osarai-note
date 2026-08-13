import { useEffect, useMemo, useState } from "react";
import { KANJI_CATALOG, type KanjiGrade } from "./kanjiCatalog";
import { studyStorage } from "./storage/indexedDb";
import type { KanjiState } from "./storage/schema";

type StatusFilter = "all" | "learned" | "unlearned";

type Props = {
  onBack: () => void;
};

function createState(character: string, learned: boolean, previous?: KanjiState): KanjiState {
  return {
    kanji: character,
    learned,
    readingMastery: previous?.readingMastery ?? 0,
    writingMastery: previous?.writingMastery ?? 0,
    nextReviewAt: previous?.nextReviewAt ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export function KanjiSettings({ onBack }: Props) {
  const [grade, setGrade] = useState<KanjiGrade>(3);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [states, setStates] = useState<Map<string, KanjiState>>(new Map());
  const [saveStatus, setSaveStatus] = useState("読み込み中…");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    void studyStorage.listKanjiStates().then(
      (items) => {
        if (!active) return;
        setStates(new Map(items.map((item) => [item.kanji, item])));
        setSaveStatus("変更はこの端末に自動保存されます");
        setBusy(false);
      },
      () => {
        if (!active) return;
        setSaveStatus("履修状態を読み込めませんでした");
        setBusy(false);
      },
    );
    return () => { active = false; };
  }, []);

  const gradeEntries = useMemo(
    () => KANJI_CATALOG.filter((entry) => entry.grade === grade),
    [grade],
  );

  const visibleEntries = useMemo(() => gradeEntries.filter((entry) => {
    const learned = states.get(entry.character)?.learned ?? true;
    const matchesStatus = statusFilter === "all"
      || (statusFilter === "learned" && learned)
      || (statusFilter === "unlearned" && !learned);
    return matchesStatus && (!query || entry.character.includes(query.trim()));
  }), [gradeEntries, query, states, statusFilter]);

  const unlearnedCount = gradeEntries.filter(
    (entry) => states.get(entry.character)?.learned === false,
  ).length;

  const toggleUnlearned = async (character: string, unlearned: boolean) => {
    const previous = states.get(character);
    const next = createState(character, !unlearned, previous);
    setBusy(true);
    setSaveStatus("保存中…");
    try {
      await studyStorage.saveKanjiState(next);
      setStates((current) => new Map(current).set(character, next));
      setSaveStatus("この端末に保存しました");
    } catch {
      setSaveStatus("保存できませんでした。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  };

  const setVisibleLearned = async (learned: boolean) => {
    if (visibleEntries.length === 0) return;
    const updates = visibleEntries.map((entry) =>
      createState(entry.character, learned, states.get(entry.character)),
    );
    setBusy(true);
    setSaveStatus("まとめて保存中…");
    try {
      await studyStorage.saveKanjiStates(updates);
      setStates((current) => {
        const next = new Map(current);
        updates.forEach((state) => next.set(state.kanji, state));
        return next;
      });
      setSaveStatus(`${updates.length}字をこの端末に保存しました`);
    } catch {
      setSaveStatus("保存できませんでした。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell settings-shell">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={onBack}>
          <span className="brand-mark">学</span><span>おさらいノート</span>
        </button>
        <div className="spike-label">漢字の履修設定</div>
        <button className="header-action" type="button" onClick={onBack}>練習へ戻る</button>
      </header>

      <main className="settings-workspace">
        <section className="settings-panel">
          <div className="settings-title-row">
            <div>
              <p className="eyebrow">保護者設定</p>
              <h1>まだ習っていない漢字</h1>
              <p>チェックした漢字は「今日の復習」や自動出題から外れます。</p>
            </div>
            <div className="grade-summary">
              <strong>{grade}年生</strong>
              <span>{gradeEntries.length}字中、未習{unlearnedCount}字</span>
            </div>
          </div>

          <div className="settings-toolbar">
            <div className="segmented" aria-label="学年">
              {[3, 4].map((value) => (
                <button key={value} type="button" className={grade === value ? "selected" : ""} onClick={() => setGrade(value as KanjiGrade)}>
                  {value}年生
                </button>
              ))}
            </div>
            <div className="segmented" aria-label="履修状態">
              <button type="button" className={statusFilter === "all" ? "selected" : ""} onClick={() => setStatusFilter("all")}>すべて</button>
              <button type="button" className={statusFilter === "learned" ? "selected" : ""} onClick={() => setStatusFilter("learned")}>習った</button>
              <button type="button" className={statusFilter === "unlearned" ? "selected" : ""} onClick={() => setStatusFilter("unlearned")}>未習</button>
            </div>
            <label className="kanji-search">
              <span>漢字を探す</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={1} inputMode="text" placeholder="例：植" />
            </label>
            <div className="bulk-actions">
              <button type="button" disabled={busy} onClick={() => void setVisibleLearned(false)}>表示中を未習</button>
              <button type="button" disabled={busy} onClick={() => void setVisibleLearned(true)}>表示中を習った</button>
            </div>
          </div>

          <div className="settings-save-status" aria-live="polite">{saveStatus}</div>

          <div className="kanji-grid" aria-busy={busy}>
            {visibleEntries.map((entry) => {
              const unlearned = states.get(entry.character)?.learned === false;
              return (
                <label className={`kanji-tile ${unlearned ? "unlearned" : ""}`} key={entry.character}>
                  <span className="tile-character">{entry.character}</span>
                  <span className="tile-check">
                    <input
                      type="checkbox"
                      checked={unlearned}
                      disabled={busy}
                      onChange={(event) => void toggleUnlearned(entry.character, event.target.checked)}
                    />
                    未習
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
