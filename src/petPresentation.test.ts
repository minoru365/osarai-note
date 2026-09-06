import { describe, expect, it } from "vitest";
import { PET_PROFILE, PET_LABEL, petAssetName, petEquipment } from "./petPresentation";
import { PET_SPECIES } from "./storage/schema";

describe("ペットの職種と装備", () => {
  it("3種類の職種を固定順で持つ", () => {
    expect(PET_SPECIES).toEqual(["hiyoko", "usagi", "kitsune"]);
    expect(PET_LABEL).toEqual({ hiyoko: "ひよこ勇者", usagi: "うさぎプリンセス", kitsune: "きつね魔法使い" });
    expect(Object.values(PET_PROFILE).map((profile) => profile.role)).toEqual(["hero", "princess", "mage"]);
  });

  it("段階ごとに装備名と画像名を導出する", () => {
    expect(petEquipment("hiyoko", 1)).toBe("旅装と木の剣");
    expect(petEquipment("hiyoko", 5)).toBe("金の完成装備");
    expect(petAssetName("kitsune", 3, "waiting", "b")).toBe(
      "kitsune-mage-stage-03-waiting-b.png",
    );
  });
});
