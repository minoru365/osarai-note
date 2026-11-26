import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { getLocalDate } from "./dailySession";
import { MAX_BACKUP_BYTES, parseBackup, summarizeBackup, type BackupFile, type BackupSummary } from "./storage/backup";
import { studyStorage } from "./storage/indexedDb";

const CONFIRM_WINDOW_MS = 3000;

/**
 * Two presses instead of confirm() (UI design standard): the first press turns
 * the button red and asks for a second press; it reverts after 3 seconds.
 */
function useTwoStepConfirm(onConfirm: () => void) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const press = () => {
    window.clearTimeout(timer.current);
    if (armed) {
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timer.current = window.setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
  };
  const disarm = () => {
    window.clearTimeout(timer.current);
    setArmed(false);
  };
  return { armed, press, disarm };
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}

function SummaryList({ summary }: { summary: BackupSummary }) {
  return (
    <dl className="backup-summary">
      <div><dt>回答の記録</dt><dd>{summary.attempts}件</dd></div>
      <div><dt>漢字の記録</dt><dd>{summary.kanjiStates}字</dd></div>
      <div><dt>ポイント</dt><dd>{summary.pointsBalance}</dd></div>
      <div><dt>育てた仲間</dt><dd>{summary.completedPets}ひき</dd></div>
    </dl>
  );
}

type Pending = { backup: BackupFile; summary: BackupSummary; fileName: string };

export function DataBackup({ onBack }: { onBack: () => void }) {
  const [current, setCurrent] = useState<BackupSummary | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void studyStorage.exportBackup().then(
      (backup) => { if (active) setCurrent(summarizeBackup(backup)); },
      () => { if (active) setError("この端末のデータを読み込めませんでした"); },
    );
    return () => { active = false; };
  }, []);

  const exportNow = async () => {
    setBusy(true);
    setError("");
    try {
      const backup = await studyStorage.exportBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `osarai-note-backup-${getLocalDate()}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage(`保存しました（回答の記録 ${backup.stores.attempts.length}件）。ファイルは端末の「ダウンロード」に入ります`);
    } catch {
      setError("保存できませんでした。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    // A newly chosen file must be confirmed from scratch.
    restore.disarm();
    setPending(null);
    setMessage("");
    setError("");
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setError("ファイルが大きすぎます。書き出したバックアップを選んでください");
      return;
    }
    try {
      const backup = parseBackup(await file.text());
      setPending({ backup, summary: summarizeBackup(backup), fileName: file.name });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ファイルを読み取れません");
    }
  };

  const restore = useTwoStepConfirm(() => {
    if (!pending) return;
    setBusy(true);
    setError("");
    void studyStorage.restoreBackup(pending.backup).then(
      () => window.location.reload(),
      () => {
        setBusy(false);
        setError("復元できませんでした。この端末のデータは元のままです");
      },
    );
  });

  const reset = useTwoStepConfirm(() => {
    setBusy(true);
    setError("");
    void studyStorage.resetAllData().then(
      () => window.location.reload(),
      () => {
        setBusy(false);
        setError("初期化できませんでした。この端末のデータは元のままです");
      },
    );
  });

  return (
    <div className="app-shell backup-shell">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={onBack}>
          <span className="brand-mark">学</span><span>おさらいノート</span>
        </button>
        <div className="spike-label">データの保存と復元</div>
        <button className="header-action" type="button" onClick={onBack}>設定へ戻る</button>
      </header>

      <main className="backup-workspace">
        <section className="backup-panel">
          <p className="eyebrow">保護者設定</p>
          <h1>学習の記録を保存する</h1>
          <p>回答の記録、漢字と単位の集計、習った漢字の設定、学年、ポイントとペットを1つのファイルに保存します。名前などの個人情報は入っていません。端末の買い替えや、ブラウザのデータが消えたときの備えにしてください。</p>
          {current && <><h2>この端末のデータ</h2><SummaryList summary={current} /></>}
          <button className="backup-primary" type="button" disabled={busy} onClick={() => void exportNow()}>今のデータをファイルに保存</button>
        </section>

        <section className="backup-panel">
          <h2>ファイルから復元する</h2>
          <p className="backup-warning">復元すると、この端末の今のデータはすべて消えて、ファイルの内容に置き換わります。先に上の「今のデータをファイルに保存」で保存しておいてください。</p>
          <label className={`backup-secondary ${busy ? "disabled" : ""}`}>
            バックアップファイルを選ぶ
            <input className="visually-hidden" type="file" accept="application/json,.json" disabled={busy} onChange={(event) => void chooseFile(event)} />
          </label>
          {pending && (
            <div className="backup-pending">
              <p><strong>{pending.fileName}</strong>（{formatDateTime(pending.summary.exportedAt)}に保存）の中身：</p>
              <SummaryList summary={pending.summary} />
              <button className={`danger-button ${restore.armed ? "armed" : ""}`} type="button" disabled={busy} onClick={restore.press}>
                {restore.armed ? "もう一度押すと置き換えます" : "この内容で置き換える"}
              </button>
            </div>
          )}
        </section>

        <section className="backup-panel">
          <h2>この端末のデータを初期化する</h2>
          <p className="backup-warning">回答の記録、集計、設定、ポイントとペットをすべて消して、はじめて使う状態に戻します。元に戻せません。必要なら先に保存してください。</p>
          <button className={`danger-button ${reset.armed ? "armed" : ""}`} type="button" disabled={busy} onClick={reset.press}>
            {reset.armed ? "もう一度押すとすべて消します" : "すべてのデータを消す"}
          </button>
        </section>

        <div className="backup-status" aria-live="polite">
          {message && <p className="backup-message">{message}</p>}
          {error && <p className="backup-error" role="alert">{error}</p>}
        </div>
      </main>
    </div>
  );
}
