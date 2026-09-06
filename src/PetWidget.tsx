import { useEffect, useState } from "react";
import {
  PET_EMOJI,
  PET_LABEL,
  petAssetUrl,
  petEquipment,
  type PetFrame,
} from "./petPresentation";
import { studyStorage } from "./storage/indexedDb";
import {
  FOOD_COSTS,
  GROWTH_STAGE_COUNT,
  PET_SPECIES,
  POINTS_PER_GROWTH_STAGE,
  POINTS_TO_COMPLETE_PET,
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
  const [frame, setFrame] = useState<PetFrame>("a");
  const [artFailed, setArtFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void studyStorage.getMotivationState().then((next) => {
      if (active) setState(next);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setFrame("a");
      return undefined;
    }
    const timer = window.setInterval(() => {
      setFrame((current) => current === "a" ? "b" : "a");
    }, 1400);
    return () => window.clearInterval(timer);
  }, []);

  const species = state?.activePetSpecies ?? null;
  const stage = species && state ? growthStage(state.activePetInvestedPoints) : 1;
  const neglected = species && state ? isPetNeglected(state.lastAnsweredAt, new Date()) : false;

  useEffect(() => {
    setArtFailed(false);
  }, [species, stage, neglected]);

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

  if (!species) {
    return (
      <section className="pet-card" aria-label="ペット育成">
        <p className="pet-complete">{PET_SPECIES.length}ひきとも さいだいまで そだてたよ！</p>
      </section>
    );
  }

  const remainingToComplete = POINTS_TO_COMPLETE_PET - state.activePetInvestedPoints;
  const pointsIntoStage = state.activePetInvestedPoints % POINTS_PER_GROWTH_STAGE;
  const pointsToNextStage = POINTS_PER_GROWTH_STAGE - pointsIntoStage;
  const stageFillPercent = (pointsIntoStage / POINTS_PER_GROWTH_STAGE) * 100;
  const mood = neglected ? "waiting" : "happy";
  const assetUrl = petAssetUrl(species, stage, mood, frame);

  return (
    <section className={`pet-card ${feeding ? "pet-feeding" : ""}`} aria-label="ペット育成">
      <div className={`pet-figure ${neglected ? "pet-sad" : "pet-happy"}`}>
        {artFailed
          ? <span className="pet-emoji-fallback" aria-hidden="true">{PET_EMOJI[species]}</span>
          : (
            <img
              className="pet-art"
              src={assetUrl}
              alt=""
              aria-hidden="true"
              onError={() => setArtFailed(true)}
            />
          )}
      </div>
      <div className="pet-info">
        <p className="pet-name">{PET_LABEL[species]}<small>そだち {stage}/{GROWTH_STAGE_COUNT}</small></p>
        <p className="pet-equipment">そうび：{petEquipment(species, stage)}</p>
        {thanks
          ? <p className="pet-thanks" role="status">{thanks}</p>
          : neglected
            ? <p className="pet-mood">すこし げんきがないみたい。いつでも待ってるよ</p>
            : <p className="pet-mood">ポイント：{state.pointsBalance}</p>}
        <div
          className="pet-growth"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={POINTS_PER_GROWTH_STAGE}
          aria-valuenow={pointsIntoStage}
          aria-label="次のそうびまで"
        >
          <i aria-hidden="true"><b style={{ width: `${stageFillPercent}%` }} /></i>
          <small>{stage === GROWTH_STAGE_COUNT
            ? `なかまになるまで あと${remainingToComplete}`
            : `つぎのそうびまで あと${pointsToNextStage}`}</small>
        </div>
        {error && <p className="pet-error" role="alert">{error}</p>}
      </div>
      <div className="pet-food-row">
        {FOOD_COSTS.map((cost) => (
          <button
            key={cost}
            type="button"
            className="pet-food-button"
            disabled={feeding || state.pointsBalance < cost || cost > remainingToComplete}
            onClick={() => handleFeed(cost)}
          >
            エサ{cost}
          </button>
        ))}
      </div>
    </section>
  );
}
