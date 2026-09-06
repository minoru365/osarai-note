import type { PetSpeciesId } from "./storage/schema";

export type PetRole = "hero" | "princess" | "mage";
export type PetMood = "happy" | "waiting";
export type PetFrame = "a" | "b";

export type PetProfile = {
  role: PetRole;
  label: string;
  shortLabel: string;
  emoji: string;
  equipment: readonly string[];
};

// Roles are derived from the stable species ID and are deliberately not saved
// in IndexedDB, so adding a future species remains a presentation-only change.
export const PET_PROFILE: Record<PetSpeciesId, PetProfile> = {
  hiyoko: {
    role: "hero",
    label: "ひよこ勇者",
    shortLabel: "ひよこ",
    emoji: "🐣",
    equipment: ["旅装と木の剣", "剣と小盾", "革よろい", "銀よろいとマント", "金の完成装備"],
  },
  usagi: {
    role: "princess",
    label: "うさぎプリンセス",
    shortLabel: "うさぎ",
    emoji: "🐰",
    equipment: ["リボンとドレス", "ティアラとケープ", "宝石ティアラとローブ", "王冠と上質なローブ", "祝祭の完成装備"],
  },
  kitsune: {
    role: "mage",
    label: "きつね魔法使い",
    shortLabel: "きつね",
    emoji: "🦊",
    equipment: ["小さな帽子と星の杖", "魔法のフードと杖", "魔法衣と月の飾り", "大きな帽子と魔法石", "光る杖と完成ローブ"],
  },
};

export const PET_EMOJI: Record<PetSpeciesId, string> = Object.fromEntries(
  Object.entries(PET_PROFILE).map(([species, profile]) => [species, profile.emoji]),
) as Record<PetSpeciesId, string>;

export const PET_LABEL: Record<PetSpeciesId, string> = Object.fromEntries(
  Object.entries(PET_PROFILE).map(([species, profile]) => [species, profile.label]),
) as Record<PetSpeciesId, string>;

export function petRole(species: PetSpeciesId): PetRole {
  return PET_PROFILE[species].role;
}

export function petEquipment(species: PetSpeciesId, stage: number): string {
  const profile = PET_PROFILE[species];
  const index = Math.max(1, Math.min(profile.equipment.length, Math.floor(stage))) - 1;
  return profile.equipment[index];
}

export function petAssetName(
  species: PetSpeciesId,
  stage: number,
  mood: PetMood,
  frame: PetFrame,
): string {
  const stageName = String(Math.max(1, Math.min(5, Math.floor(stage)))).padStart(2, "0");
  return `${species}-${petRole(species)}-stage-${stageName}-${mood}-${frame}.png`;
}

export function petAssetUrl(
  species: PetSpeciesId,
  stage: number,
  mood: PetMood,
  frame: PetFrame,
): string {
  return `${import.meta.env.BASE_URL}pets/${petAssetName(species, stage, mood, frame)}`;
}
