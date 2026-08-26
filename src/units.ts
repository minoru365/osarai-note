// Units domain model (docs/units-plan.md).
//
// Every quantity is held as an integer count of its category's base unit, and
// all conversion and answer checking is integer arithmetic. Multiplying the
// displayed decimal by a factor would not be safe: 8.2 * 100 is
// 819.9999999999999 in IEEE 754, which would reject a correct answer.

export const UNIT_CATEGORIES = ["length", "weight", "volume", "time", "area"] as const;
export type UnitCategory = typeof UNIT_CATEGORIES[number];

export const UNIT_QUESTION_TYPES = [
  "conversion",
  "comparison",
  "appropriateUnit",
  "senseEstimate",
  "wordProblem",
] as const;
export type UnitQuestionType = typeof UNIT_QUESTION_TYPES[number];

export type UnitGrade = 2 | 3 | 4;

export type UnitDefinition = {
  id: string;
  category: UnitCategory;
  label: string;
  /** How many base units one of this unit is worth. Always an integer. */
  baseFactor: number;
  /** Grade the unit is introduced in; 2 means "already known before grade 3". */
  introducedGrade: UnitGrade;
};

// Base units: length=mm, weight=g, volume=mL, time=second, area=cm².
export const UNIT_DEFINITIONS: readonly UnitDefinition[] = [
  { id: "mm", category: "length", label: "mm", baseFactor: 1, introducedGrade: 2 },
  { id: "cm", category: "length", label: "cm", baseFactor: 10, introducedGrade: 2 },
  { id: "m", category: "length", label: "m", baseFactor: 1_000, introducedGrade: 2 },
  { id: "km", category: "length", label: "km", baseFactor: 1_000_000, introducedGrade: 3 },

  { id: "g", category: "weight", label: "g", baseFactor: 1, introducedGrade: 3 },
  { id: "kg", category: "weight", label: "kg", baseFactor: 1_000, introducedGrade: 3 },
  { id: "t", category: "weight", label: "t", baseFactor: 1_000_000, introducedGrade: 3 },

  { id: "mL", category: "volume", label: "mL", baseFactor: 1, introducedGrade: 2 },
  { id: "dL", category: "volume", label: "dL", baseFactor: 100, introducedGrade: 2 },
  { id: "L", category: "volume", label: "L", baseFactor: 1_000, introducedGrade: 2 },

  { id: "sec", category: "time", label: "秒", baseFactor: 1, introducedGrade: 3 },
  { id: "min", category: "time", label: "分", baseFactor: 60, introducedGrade: 2 },
  { id: "hour", category: "time", label: "時間", baseFactor: 3_600, introducedGrade: 2 },
  { id: "day", category: "time", label: "日", baseFactor: 86_400, introducedGrade: 2 },

  { id: "cm2", category: "area", label: "cm²", baseFactor: 1, introducedGrade: 4 },
  { id: "m2", category: "area", label: "m²", baseFactor: 10_000, introducedGrade: 4 },
  { id: "a", category: "area", label: "a", baseFactor: 1_000_000, introducedGrade: 4 },
  { id: "ha", category: "area", label: "ha", baseFactor: 100_000_000, introducedGrade: 4 },
  { id: "km2", category: "area", label: "km²", baseFactor: 10_000_000_000, introducedGrade: 4 },
];

const UNITS_BY_ID = new Map(UNIT_DEFINITIONS.map((unit) => [unit.id, unit]));

export function getUnit(unitId: string): UnitDefinition {
  const unit = UNITS_BY_ID.get(unitId);
  if (!unit) throw new Error(`未知の単位です: ${unitId}`);
  return unit;
}

export function unitsForCategory(category: UnitCategory): UnitDefinition[] {
  return UNIT_DEFINITIONS.filter((unit) => unit.category === category);
}

/** Units a child in `grade` has been taught, per docs/units-plan.md 1.1. */
export function unitsAvailableForGrade(grade: 3 | 4): UnitDefinition[] {
  return UNIT_DEFINITIONS.filter((unit) => unit.introducedGrade <= grade);
}

export function isUnitAvailableForGrade(unitId: string, grade: 3 | 4): boolean {
  return getUnit(unitId).introducedGrade <= grade;
}

/**
 * Splits a non-negative decimal string into an integer mantissa and the number
 * of decimal places, so callers can scale without floating point.
 * Returns null for anything that is not a plain decimal number.
 */
export function parseDecimal(input: string): { mantissa: number; places: number } | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/u.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const mantissa = Number(`${whole}${fraction}`);
  if (!Number.isSafeInteger(mantissa)) return null;
  return { mantissa, places: fraction.length };
}

/**
 * Converts an entered decimal in `unitId` into an exact integer count of base
 * units. Returns null when the input is malformed, or when it does not land on
 * a whole number of base units (e.g. 0.5mm).
 */
export function parseQuantityToBase(input: string, unitId: string): number | null {
  const parsed = parseDecimal(input);
  if (!parsed) return null;
  const { baseFactor } = getUnit(unitId);
  const divisor = 10 ** parsed.places;
  const scaled = parsed.mantissa * baseFactor;
  if (!Number.isSafeInteger(scaled) || scaled % divisor !== 0) return null;
  return scaled / divisor;
}

function isPowerOfTen(value: number): boolean {
  return /^10*$/u.test(String(value));
}

/**
 * Renders an integer count of base units in `unitId`, trimming trailing zeros.
 * Uses string arithmetic so 820 base units render as "8.2", not "8.199999...".
 *
 * Throws rather than render a fraction of a unit whose factor is not a power of
 * ten: 90 seconds is 1.5 minutes, and decimal digits of a base-60 remainder
 * would silently read as "1.3". Time quantities must be whole in their display
 * unit, which the pack validator enforces.
 */
export function formatBaseValue(baseValue: number, unitId: string): string {
  if (!Number.isSafeInteger(baseValue) || baseValue < 0) {
    throw new Error("表示できる数量ではありません");
  }
  const { baseFactor } = getUnit(unitId);
  const whole = Math.floor(baseValue / baseFactor);
  const remainder = baseValue % baseFactor;
  if (remainder === 0) return String(whole);
  if (!isPowerOfTen(baseFactor)) {
    throw new Error(`${unitId}は小数で表示できません`);
  }
  const fraction = String(remainder).padStart(String(baseFactor).length - 1, "0").replace(/0+$/u, "");
  return `${whole}.${fraction}`;
}

export function formatQuantity(baseValue: number, unitId: string): string {
  return `${formatBaseValue(baseValue, unitId)}${getUnit(unitId).label}`;
}

/** True when the quantity is a whole number of `unitId` (no decimal point). */
export function isWholeIn(baseValue: number, unitId: string): boolean {
  return baseValue % getUnit(unitId).baseFactor === 0;
}

/** Weakness aggregate key, per docs/units-plan.md 5. */
export function unitStateKey(category: UnitCategory, questionType: UnitQuestionType): string {
  return `${category}:${questionType}`;
}
