import { useState } from "react";
import type { Badge, CollectionCell, CollectionStatus, KanjiCollectionSection, PetCollectionEntry, UnitCollectionSection } from "./collections";
import { summarize } from "./collections";
import { JapanMapSvg } from "./JapanMapSvg";
import type { JapanMapPrefectureId } from "./japanMapContent";
import { PET_LABEL, petAssetUrl, petEquipment } from "./petPresentation";
import { GROWTH_STAGE_COUNT } from "./storage/schema";
import { UNIT_CATEGORY_LABEL } from "./units";

const STATUS_LABEL: Record<CollectionStatus, string> = {
  collected: "あつめた",
  practiced: "れんしゅう中",
  notYet: "まだ",
  notTaught: "まだならっていない",
  preparing: "じゅんびちゅう",
};

function Legend({ statuses, map = false }: { statuses: CollectionStatus[]; map?: boolean }) {
  return (
    <ul className={`collection-legend${map ? " collection-legend-map" : ""}`} aria-label="色の見かた">
      {statuses.map((status) => <li key={status}><span className={`collection-swatch status-${status}`} aria-hidden="true" />{STATUS_LABEL[status]}</li>)}
    </ul>
  );
}

function Count({ cells }: { cells: CollectionCell[] }) {
  const { collected, available } = summarize(cells);
  return <span className="collection-count">あつめた <strong>{collected}</strong> / {available}</span>;
}

function PetStage({ entry, stage }: { entry: PetCollectionEntry; stage: number }) {
  const [failed, setFailed] = useState(false);
  const reached = stage <= entry.stagesReached;
  return (
    <figure className={`collection-pet-stage ${reached ? "reached" : "locked"}`}>
      {failed
        ? <span className="collection-pet-fallback" aria-hidden="true">？</span>
        : <img src={petAssetUrl(entry.species, stage, "happy", "a")} alt="" aria-hidden="true" onError={() => setFailed(true)} />}
      <figcaption>{reached ? petEquipment(entry.species, stage) : `そだち${stage}`}</figcaption>
    </figure>
  );
}

export function CollectionView({
  pets,
  kanji,
  units,
  prefectures,
  mapAvailable,
  onPracticeKanji,
}: {
  pets: PetCollectionEntry[];
  kanji: KanjiCollectionSection[] | null;
  units: UnitCollectionSection[] | null;
  prefectures: CollectionCell<JapanMapPrefectureId>[] | null;
  mapAvailable: boolean;
  onPracticeKanji: (kanji: string) => void;
}) {
  const fills = Object.fromEntries((prefectures ?? [])
    .filter((cell) => cell.status === "collected" || cell.status === "practiced")
    .map((cell) => [cell.key, cell.status])) as Partial<Record<JapanMapPrefectureId, "collected" | "practiced">>;

  return (
    <div className="collection-view">
      <section className="achievements-panel collection-panel">
        <h2>なかま図鑑</h2>
        <p className="achievements-hint">ポイントでそだてると、そうびが増えていくよ</p>
        <div className="collection-pets">
          {pets.map((entry) => (
            <div className="collection-pet" key={entry.species}>
              <h3>{entry.stagesReached > 0 ? PET_LABEL[entry.species] : "？？？"}{entry.completed && <span className="collection-pet-done">そだてた！</span>}</h3>
              <div className="collection-pet-stages">
                {Array.from({ length: GROWTH_STAGE_COUNT }, (_, index) => <PetStage entry={entry} stage={index + 1} key={index} />)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="achievements-panel collection-panel">
        <h2>漢字図鑑</h2>
        <p className="achievements-hint">読みと書きを、どちらも1回目で正かいすると色がつくよ。タップすると練習できるよ</p>
        <Legend statuses={["collected", "practiced", "notYet", "notTaught", "preparing"]} />
        {kanji === null
          ? <p className="achievements-empty">漢字の問題を読み込めませんでした</p>
          : kanji.length === 0
            ? <p className="achievements-empty">ホームで学年をえらぶと出てくるよ</p>
            : kanji.map((section) => (
              <div className="collection-group" key={section.grade}>
                <h3>{section.grade}年生<Count cells={section.cells} /></h3>
                <div className="collection-kanji-grid">
                  {section.cells.map((cell) => {
                    const label = `${cell.label}：${STATUS_LABEL[cell.status]}`;
                    return cell.status === "notTaught" || cell.status === "preparing"
                      ? <span key={cell.key} className={`collection-cell status-${cell.status}`} role="img" aria-label={label} title={label}>{cell.label}</span>
                      : <button key={cell.key} type="button" className={`collection-cell status-${cell.status}`} aria-label={label} title={label} onClick={() => onPracticeKanji(cell.key)}>{cell.label}</button>;
                  })}
                </div>
              </div>
            ))}
      </section>

      <section className="achievements-panel collection-panel">
        <h2>たんい図鑑</h2>
        <p className="achievements-hint">そのたんいを使う問題を3問、1回目で正かいすると色がつくよ</p>
        <Legend statuses={["collected", "practiced", "notYet", "notTaught", "preparing"]} />
        {units === null
          ? <p className="achievements-empty">たんいの問題を読み込めませんでした</p>
          : (
            <>
              <p className="collection-total"><Count cells={units.flatMap((section) => section.cells)} /></p>
              <div className="collection-unit-rows">
                {units.map((section) => (
                  <div className="collection-unit-row" key={section.category}>
                    <span className="collection-unit-name">{UNIT_CATEGORY_LABEL[section.category]}</span>
                    <div className="collection-unit-cells">
                      {section.cells.map((cell) => (
                        <span key={cell.key} className={`collection-cell status-${cell.status}`} role="img" aria-label={`${cell.label}：${STATUS_LABEL[cell.status]}`} title={STATUS_LABEL[cell.status]}>{cell.label}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
      </section>

      <section className="achievements-panel collection-panel">
        <h2>都道府県図鑑</h2>
        <p className="achievements-hint">日本地図で1回目に正かいすると、その県に色がつくよ</p>
        <Legend statuses={["collected", "practiced"]} map />
        {prefectures === null
          ? <p className="achievements-empty">日本地図の問題を読み込めませんでした</p>
          : (
            <>
              <p className="collection-total"><Count cells={prefectures} /></p>
              {!mapAvailable && <p className="achievements-empty">日本地図は4年生の学習です。ホームで4年生をえらぶと集められるよ</p>}
              <div className="collection-map">
                <JapanMapSvg interactive={false} fills={fills} label={`都道府県図鑑。${summarize(prefectures).collected}県あつめた`} />
              </div>
            </>
          )}
      </section>
    </div>
  );
}

export function BadgeView({ badges }: { badges: Badge[] }) {
  const groups = [...new Set(badges.map((badge) => badge.group))];
  const achieved = badges.filter((badge) => badge.achieved).length;
  return (
    <div className="collection-view">
      <section className="achievements-panel collection-panel">
        <h2>バッジ<span className="collection-count">もらった <strong>{achieved}</strong> / {badges.length}</span></h2>
        <p className="achievements-hint">学習をつづけると、少しずつ増えていくよ。なくなることはないよ</p>
        {groups.map((group) => (
          <div className="collection-group" key={group}>
            <h3>{group}</h3>
            <ul className="badge-grid">
              {badges.filter((badge) => badge.group === group).map((badge) => (
                <li key={badge.id} className={`badge ${badge.achieved ? "achieved" : "locked"}`}>
                  <span className="badge-medal" aria-hidden="true">{badge.achieved ? "★" : "☆"}</span>
                  <strong>{badge.title}</strong>
                  <small>{badge.achieved ? "もらったよ" : `あと${badge.target - badge.current}`}</small>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
