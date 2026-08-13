type Props = {
  questionCount: number;
  contentError: string;
  onStartKanji: () => void;
  onOpenKanjiSettings: () => void;
};

const SUBJECTS = [
  { icon: "字", name: "漢字", note: "3・4年生", ready: true },
  { icon: "単", name: "単位", note: "準備中", ready: false },
  { icon: "分", name: "分数", note: "準備中", ready: false },
  { icon: "地", name: "日本地図", note: "準備中", ready: false },
  { icon: "理", name: "理科", note: "準備中", ready: false },
];

export function Home({ questionCount, contentError, onStartKanji, onOpenKanjiSettings }: Props) {
  const canStart = questionCount > 0 && !contentError;

  return (
    <div className="app-shell home-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">学</span><span>おさらいノート</span></div>
        <div className="spike-label">おうちの復習</div>
        <button className="header-action" type="button" onClick={onOpenKanjiSettings}>保護者設定</button>
      </header>

      <main className="home-workspace">
        <section className="today-card">
          <div className="today-copy">
            <p className="eyebrow">今日の学習</p>
            <h1>まずは漢字から<br />やってみよう</h1>
            <p>読みを50音表で答えてから、書き順を一画ずつ練習します。</p>
            <button className="start-button" type="button" disabled={!canStart} onClick={onStartKanji}>
              {contentError ? "問題を読み込めません" : questionCount > 0 ? `漢字の試し練習 ${questionCount}問` : "問題を読み込み中…"}
              <span>→</span>
            </button>
            {contentError && <small className="home-error">{contentError}</small>}
          </div>
          <div className="today-visual" aria-hidden="true">
            <div className="notebook-page">
              <span>きょうも</span>
              <strong>できた！</strong>
              <div className="progress-stars">★ ★ ☆</div>
            </div>
          </div>
        </section>

        <section className="home-section">
          <div className="section-heading">
            <div><p className="eyebrow">教科から練習</p><h2>何を復習する？</h2></div>
            <button type="button" onClick={onOpenKanjiSettings}>未習漢字を設定</button>
          </div>
          <div className="subject-grid">
            {SUBJECTS.map((subject) => (
              <button
                className={`subject-card ${subject.ready ? "ready" : ""}`}
                type="button"
                disabled={!subject.ready || !canStart}
                onClick={subject.ready ? onStartKanji : undefined}
                key={subject.name}
              >
                <span className="subject-icon">{subject.icon}</span>
                <strong>{subject.name}</strong>
                <small>{subject.ready ? `${questionCount}問を試せます` : subject.note}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="home-status-row">
          <div><span>保存先</span><strong>このタブレット</strong><small>学習データは外へ送りません</small></div>
          <div><span>現在の段階</span><strong>漢字機能を開発中</strong><small>単位・分数・地図・理科は順次追加</small></div>
          <div><span>保護者向け</span><strong>未習漢字を除外</strong><small>3年生200字・4年生202字</small></div>
        </section>
      </main>
    </div>
  );
}
