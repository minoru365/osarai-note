import { useEffect, useState } from "react";
import { PET_EMOJI, PET_LABEL } from "./petPresentation";
import { studyStorage } from "./storage/indexedDb";
import {
  FOOD_COSTS,
  GROWTH_STAGE_COUNT,
  POINTS_PER_GROWTH_STAGE,
  growthStage,
  isPetNeglected,
  type FoodCost,
  type MotivationState,
} from "./storage/schema";

export function PetWidget() {
  const [state, setState] = useState<MotivationState | null>(null);
  const [thanks, setThanks] = useState<string | null>(null);
  const [feeding, setFeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void studyStorage.getMotivationState().then((next) => {
      if (active) setState(next);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!state) return null;

  const handleFeed = (cost: FoodCost) => {
    if (feeding) return;
    setFeeding(true);
    setError(null);
    void studyStorage.feedPet(cost, new Date().toISOString())
      .then((next) => {
        setState(next);
        setThanks("ありがとう！");
        window.setTimeout(() => setThanks(null), 1500);
      })
      .catch((feedError: unknown) => {
        setError(feedError instanceof Error ? feedError.message : "エサをあげられませんでした");
      })
      .finally(() => setFeeding(false));
  };

  if (!state.activePetSpecies) {
    return (
      <section className="pet-card" aria-label="ペット育成">
        <p className="pet-complete">2ひきとも さいだいまで そだてたよ！</p>
      </section>
    );
  }

  const species = state.activePetSpecies;
  const stage = growthStage(state.activePetInvestedPoints);
  const neglected = isPetNeglected(state.lastAnsweredAt, new Date());
  // How far this pet has come inside its current stage, so the child can see
  // the next growth coming rather than only the stage number.
  const atFinalStage = stage >= GROWTH_STAGE_COUNT;
  const pointsIntoStage = state.activePetInvestedPoints % POINTS_PER_GROWTH_STAGE;
  const pointsToNextStage = POINTS_PER_GROWTH_STAGE - pointsIntoStage;
  const stageFillPercent = atFinalStage ? 100 : (pointsIntoStage / POINTS_PER_GROWTH_STAGE) * 100;

  return (
    <section className={`pet-card ${feeding ? "pet-feeding" : ""}`} aria-label="ペット育成">
      <div className={`pet-figure ${neglected ? "pet-sad" : "pet-happy"}`} aria-hidden="true">
        <span style={{ fontSize: `${52 + stage * 10}px` }}>{PET_EMOJI[species]}</span>
      </div>
      <div className="pet-info">
        <p className="pet-name">{PET_LABEL[species]}<small>そだち {stage}/{GROWTH_STAGE_COUNT}</small></p>
        {neglected
          ? <p className="pet-mood">すこし げんきがないみたい…</p>
          : thanks
            ? <p className="pet-thanks" role="status">{thanks}</p>
            : <p className="pet-mood">ポイント：{state.pointsBalance}</p>}
        <div
          className="pet-growth"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={POINTS_PER_GROWTH_STAGE}
          aria-valuenow={atFinalStage ? POINTS_PER_GROWTH_STAGE : pointsIntoStage}
          aria-label="次のそだちまで"
        >
          <i aria-hidden="true"><b style={{ width: `${stageFillPercent}%` }} /></i>
          <small>{atFinalStage ? "さいだいまで そだったよ！" : `つぎのそだちまで あと${pointsToNextStage}`}</small>
        </div>
        {error && <p className="pet-error" role="alert">{error}</p>}
      </div>
      <div className="pet-food-row">
        {FOOD_COSTS.map((cost) => (
          <button
            key={cost}
            type="button"
            className="pet-food-button"
            disabled={feeding || state.pointsBalance < cost}
            onClick={() => handleFeed(cost)}
          >
            エサ{cost}
          </button>
        ))}
      </div>
    </section>
  );
}
