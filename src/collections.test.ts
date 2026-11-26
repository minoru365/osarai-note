import { describe, expect, it } from "vitest";
import {
  badges,
  countCompletedQuestions,
  isKanjiCollected,
  kanjiCollection,
  petCollection,
  prefectureCollection,
  summarize,
  UNIT_COLLECT_THRESHOLD,
  unitCollection,
} from "./collections";
import type { KanjiQuestion } from "./contentPack";
import type { JapanMapQuestion } from "./japanMapContent";
import type { UnitQuestion } from "./unitContent";
import { createEmptyKanjiSkillStats, createInitialMotivationState, type KanjiState, type StudyAttempt } from "./storage/schema";

const stats = (presentations: number, firstTryCorrect: number, weakness = 0) => ({ ...createEmptyKanjiSkillStats(), presentations, firstTryCorrect, weakness });
const kanjiState = (kanji: string, reading: ReturnType<typeof stats>, writing: ReturnType<typeof stats>, learned = true): KanjiState => ({ kanji, learned, reading, writing, updatedAt: "" });
const kanjiQuestion = (kanji: string): KanjiQuestion => ({ id: `q-${kanji}`, grade: 3, mode: "reading", word: kanji, reading: "よみ", prompt: "", targetKanji: [kanji], answerKanji: kanji, promptBefore: "", promptAfter: "" });

const attempt = (overrides: Partial<StudyAttempt>): StudyAttempt => ({
  id: Math.random().toString(36), sessionId: "s", questionId: "q", subject: "kanji", mode: "quiz", answer: "",
  correct: true, mistakes: 0, usedGuide: false, answeredAt: "2026-11-20T10:00:00.000Z", ...overrides,
});

describe("漢字の図鑑", () => {
  // 悪 and 安 are grade 3; 愛 is grade 4.
  const questions = [kanjiQuestion("悪"), kanjiQuestion("安"), kanjiQuestion("暗"), kanjiQuestion("医"), kanjiQuestion("愛")];

  it("読み・書きの両方で一回目に正解したら集めたことになり、あとで苦手になっても消えない", () => {
    const state = kanjiState("悪", stats(3, 1, 4), stats(2, 1, 5));
    expect(isKanjiCollected(state)).toBe(true);
    expect(isKanjiCollected(kanjiState("悪", stats(3, 1), stats(2, 0)))).toBe(false);
  });

  it("問題が無い字は「じゅんびちゅう」、習っていない字は「まだならっていない」にする", () => {
    const sections = kanjiCollection([
      kanjiState("悪", stats(1, 1), stats(1, 1)),
      kanjiState("安", stats(1, 0), stats(0, 0)),
      kanjiState("暗", stats(0, 0), stats(0, 0), false),
    ], questions, [3, 4]);
    const cells = Object.fromEntries(sections.flatMap((section) => section.cells).map((cell) => [cell.key, cell.status]));
    expect(cells["悪"]).toBe("collected");
    expect(cells["安"]).toBe("practiced");
    expect(cells["暗"]).toBe("notTaught");
    expect(cells["医"]).toBe("notYet");
    expect(cells["院"]).toBe("preparing");
  });

  it("選んでいない学年は出さない", () => {
    expect(kanjiCollection([], questions, [3]).map((section) => section.grade)).toEqual([3]);
    expect(kanjiCollection([], questions, []).map((section) => section.grade)).toEqual([]);
  });

  it("集めた数は、問題が用意できていない字を分母に入れない", () => {
    const [grade3] = kanjiCollection([kanjiState("悪", stats(1, 1), stats(1, 1))], questions, [3]);
    expect(summarize(grade3.cells)).toEqual({ collected: 1, available: 4 });
  });
});

describe("たんいの図鑑", () => {
  const unitQuestion = (id: string, units: string[], grade: 3 | 4 = 3, unitCategory: UnitQuestion["unitCategory"] = "length"): UnitQuestion => ({
    id, grade, unitCategory, questionType: "conversion", prompt: "", explanation: "", requiredUnits: units, answerType: "numeric", answerUnit: units[0], answerBaseValue: 1,
  } as UnitQuestion);
  const questions = [
    unitQuestion("u1", ["cm", "mm"]), unitQuestion("u2", ["cm", "m"]), unitQuestion("u3", ["cm", "km"]), unitQuestion("u4", ["cm"]),
    unitQuestion("a1", ["m2", "cm2"], 4, "area"),
  ];
  const cells = (attempts: StudyAttempt[], unlearned: string[] = [], grades: (3 | 4)[] = [3, 4]) =>
    Object.fromEntries(unitCollection(attempts, questions, unlearned, grades).flatMap((section) => section.cells).map((cell) => [cell.key, cell.status]));

  it(`その単位を使う問題で${UNIT_COLLECT_THRESHOLD}問、一回目に正解したら集めたことになる（同じ問題は1回）`, () => {
    const right = (questionId: string) => attempt({ subject: "units", questionId, firstTryCorrect: true });
    expect(cells([right("u1"), right("u1"), right("u2")]).cm).toBe("practiced");
    expect(cells([right("u1"), right("u2"), right("u3")]).cm).toBe("collected");
  });

  it("問題が無い単位・習っていない・選んでいない学年を区別する", () => {
    expect(cells([]).t).toBe("preparing");
    expect(cells([], ["area:4"]).m2).toBe("notTaught");
    expect(cells([], [], [3]).m2).toBe("notTaught");
    expect(cells([]).m2).toBe("notYet");
  });

  it("今の問題集に無い問題の回答は飛ばす", () => {
    expect(() => cells([attempt({ subject: "units", questionId: "gone", firstTryCorrect: true })])).not.toThrow();
  });
});

describe("都道府県の図鑑", () => {
  const mapQuestion = (prefectureId: JapanMapQuestion["prefectureId"], answer: string): JapanMapQuestion => ({ id: `japan-map:prefecture:${prefectureId}`, grade: 4, questionType: "prefecture-location", prefectureId, answer, prompt: "", explanation: "" });
  const questions = [mapQuestion("tokyo", "東京都"), mapQuestion("osaka", "大阪府")];

  it("一回目に正解した県は集めたことになり、問題IDではなく問題集から県を引く", () => {
    const cells = prefectureCollection([
      attempt({ subject: "japan-map", questionId: "japan-map:prefecture:tokyo", firstTryCorrect: true }),
      attempt({ subject: "japan-map", questionId: "japan-map:prefecture:osaka", correct: false, firstTryCorrect: false }),
      attempt({ subject: "japan-map", questionId: "removed-question", firstTryCorrect: true }),
    ], questions, [3, 4]);
    const byId = Object.fromEntries(cells.map((cell) => [cell.key, cell]));
    expect(byId.tokyo).toMatchObject({ status: "collected", label: "東京都" });
    expect(byId.osaka.status).toBe("practiced");
    expect(byId.hokkaido.status).toBe("preparing");
    expect(cells).toHaveLength(47);
  });

  it("4年生を選んでいないときは、集めた県は残したまま他を「まだならっていない」にする", () => {
    const cells = prefectureCollection([attempt({ subject: "japan-map", questionId: "japan-map:prefecture:tokyo", firstTryCorrect: true })], questions, [3]);
    const byId = Object.fromEntries(cells.map((cell) => [cell.key, cell.status]));
    expect(byId.tokyo).toBe("collected");
    expect(byId.osaka).toBe("notTaught");
  });
});

describe("仲間の図鑑", () => {
  it("育て終えた仲間は5段階、育成中は今の段階、まだの仲間は0", () => {
    const state = { ...createInitialMotivationState(""), activePetSpecies: "usagi" as const, activePetInvestedPoints: 250, completedPets: [{ species: "hiyoko" as const, completedAt: "" }] };
    expect(petCollection(state)).toEqual([
      { species: "hiyoko", stagesReached: 5, completed: true },
      { species: "usagi", stagesReached: 3, completed: false },
      { species: "kitsune", stagesReached: 0, completed: false },
    ]);
  });
});

describe("バッジ", () => {
  it("といた問題は、同じ問題のやり直しを1問として数える", () => {
    expect(countCompletedQuestions([
      attempt({ sessionItemId: "item-1", correct: false }),
      attempt({ sessionItemId: "item-1", correct: true }),
      attempt({ sessionItemId: "item-2", correct: true }),
      attempt({ correct: true }),
    ])).toBe(3);
  });

  it("累計だけで達成を決め、集める系の最後は用意できている数を目標にする", () => {
    const list = badges({
      completedQuestions: 120, studyDays: 6,
      kanji: { collected: 12, available: 40 }, units: { collected: 0, available: 3 }, prefectures: { collected: 2, available: 2 }, completedPets: 1,
    });
    const byId = Object.fromEntries(list.map((badge) => [badge.id, badge]));
    expect(byId["questions-100"].achieved).toBe(true);
    expect(byId["questions-300"]).toMatchObject({ achieved: false, current: 120, target: 300 });
    expect(byId["days-5"].achieved).toBe(true);
    expect(byId["kanji-10"].achieved).toBe(true);
    // Steps at or above what is available are dropped; the "all" badge targets the available count.
    expect(byId["kanji-50"]).toBeUndefined();
    expect(byId["kanji-all"]).toMatchObject({ target: 40, achieved: false });
    expect(byId["prefectures-all"]).toMatchObject({ target: 2, achieved: true });
    expect(byId["pets-1"].achieved).toBe(true);
    expect(byId["pets-2"].achieved).toBe(false);
  });

  it("用意できている数が0の集める系バッジは出さない", () => {
    const list = badges({ completedQuestions: 0, studyDays: 0, kanji: { collected: 0, available: 0 }, units: { collected: 0, available: 0 }, prefectures: { collected: 0, available: 0 }, completedPets: 0 });
    expect(list.some((badge) => badge.group === "漢字" || badge.group === "たんい" || badge.group === "都道府県")).toBe(false);
  });
});
