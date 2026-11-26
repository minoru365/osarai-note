// JSON backup of everything the app keeps on the device (ADR-0014).
//
// A backup is a raw snapshot of every IndexedDB store, so it carries records in
// whatever shape earlier versions of the app wrote them. Validation is
// therefore structural: it proves the file is ours, matches this database
// version and can be put back key for key, without re-applying the strict
// rules used when answers are first saved (old records never went through them).
import {
  normalizeMotivationState,
  PET_SPECIES,
  POINTS_TO_COMPLETE_PET,
  STORE_NAMES,
  STUDY_DB_VERSION,
  type MotivationState,
} from "./schema";

export const BACKUP_FORMAT = "osarai-note-backup";
export const BACKUP_FORMAT_VERSION = 1;
/** Large enough for years of answers; stops a wrong file from freezing the tablet. */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export type BackupStoreName = typeof STORE_NAMES[keyof typeof STORE_NAMES];
export const BACKUP_STORES = Object.values(STORE_NAMES) as BackupStoreName[];

/** The key each store is addressed by (matches the keyPath in openStudyDatabase). */
const STORE_KEYS: Record<BackupStoreName, string> = {
  attempts: "id",
  kanjiStates: "kanji",
  customQuestions: "id",
  sessions: "id",
  settings: "id",
  motivation: "id",
  unitStates: "key",
};

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  dbVersion: number;
  exportedAt: string;
  stores: Record<BackupStoreName, Record<string, unknown>[]>;
};

export type BackupSummary = {
  exportedAt: string;
  attempts: number;
  kanjiStates: number;
  sessions: number;
  pointsBalance: number;
  completedPets: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createBackupFile(
  stores: Record<BackupStoreName, Record<string, unknown>[]>,
  now: Date,
): BackupFile {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    dbVersion: STUDY_DB_VERSION,
    exportedAt: now.toISOString(),
    stores,
  };
}

function validateMotivationRecord(record: Record<string, unknown>): void {
  // Older data is continued (not rewritten) on read, so check what the app
  // will actually see after that step.
  const state = normalizeMotivationState(record as unknown as MotivationState);
  const valid = state.id === "app"
    && Number.isInteger(state.pointsBalance) && state.pointsBalance >= 0
    && Number.isInteger(state.activePetInvestedPoints) && state.activePetInvestedPoints >= 0
    && Array.isArray(state.completedPets) && state.completedPets.length <= PET_SPECIES.length
    && state.completedPets.every((pet, index) => isPlainObject(pet) && pet.species === PET_SPECIES[index] && typeof pet.completedAt === "string")
    && state.activePetSpecies === (PET_SPECIES[state.completedPets.length] ?? null)
    && (state.activePetSpecies === null ? state.activePetInvestedPoints === 0 : state.activePetInvestedPoints < POINTS_TO_COMPLETE_PET)
    && typeof state.updatedAt === "string";
  if (!valid) throw new Error("ペットの育成状態が正しくありません");
}

/** Checks a parsed backup and returns it typed. Throws a message a parent can read. */
export function validateBackup(value: unknown): BackupFile {
  if (!isPlainObject(value) || value.format !== BACKUP_FORMAT) {
    throw new Error("おさらいノートのバックアップではありません");
  }
  if (value.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error("このアプリでは読めない形式の版です");
  }
  if (value.dbVersion !== STUDY_DB_VERSION) {
    throw new Error(`データの版が違います（ファイル: ${String(value.dbVersion)}、このアプリ: ${STUDY_DB_VERSION}）`);
  }
  if (typeof value.exportedAt !== "string" || Number.isNaN(Date.parse(value.exportedAt))) {
    throw new Error("書き出し日時がありません");
  }
  if (!isPlainObject(value.stores)) throw new Error("データが入っていません");

  const stores = value.stores;
  const unknown = Object.keys(stores).filter((name) => !(BACKUP_STORES as string[]).includes(name));
  if (unknown.length > 0) throw new Error(`知らない種類のデータがあります: ${unknown.join(", ")}`);

  for (const name of BACKUP_STORES) {
    const records = stores[name];
    if (!Array.isArray(records)) throw new Error(`データの種類が欠けています: ${name}`);
    const keyName = STORE_KEYS[name];
    const keys = new Set<string>();
    records.forEach((record) => {
      if (!isPlainObject(record)) throw new Error(`記録の形が正しくありません: ${name}`);
      const key = record[keyName];
      if (typeof key !== "string" || key.length === 0) throw new Error(`記録のキーがありません: ${name}`);
      if (keys.has(key)) throw new Error(`同じ記録が重複しています: ${name} / ${key}`);
      keys.add(key);
    });
  }

  const motivation = stores.motivation as Record<string, unknown>[];
  if (motivation.length > 1) throw new Error("ペットの育成状態が複数あります");
  motivation.forEach(validateMotivationRecord);
  return value as unknown as BackupFile;
}

/** Parses the text of a backup file. */
export function parseBackup(text: string): BackupFile {
  if (text.length > MAX_BACKUP_BYTES) throw new Error("ファイルが大きすぎます");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("ファイルを読み取れません。書き出したJSONファイルを選んでください");
  }
  return validateBackup(value);
}

export function summarizeBackup(backup: BackupFile): BackupSummary {
  const motivation = backup.stores.motivation[0] as Partial<MotivationState> | undefined;
  return {
    exportedAt: backup.exportedAt,
    attempts: backup.stores.attempts.length,
    kanjiStates: backup.stores.kanjiStates.length,
    sessions: backup.stores.sessions.length,
    pointsBalance: motivation?.pointsBalance ?? 0,
    completedPets: motivation?.completedPets?.length ?? 0,
  };
}
