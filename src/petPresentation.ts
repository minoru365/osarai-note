import type { PetSpeciesId } from "./storage/schema";

// Placeholder art (ADR-0006): swap for the real per-stage illustrations later.
export const PET_EMOJI: Record<PetSpeciesId, string> = {
  hiyoko: "🐣",
  usagi: "🐰",
};

export const PET_LABEL: Record<PetSpeciesId, string> = {
  hiyoko: "ひよこ",
  usagi: "うさぎ",
};
