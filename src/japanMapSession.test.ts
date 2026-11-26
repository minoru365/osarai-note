import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { selectJapanMapQuestions, startNextJapanMapBatch, summarizeJapanMapSession } from "./japanMapSession";
import type { JapanMapQuestion } from "./japanMapContent";
import { StudyStorage } from "./storage/indexedDb";
import type { JapanMapSessionAttempt, StudyAttempt } from "./storage/schema";

const question = (id: string, prefectureId: JapanMapQuestion["prefectureId"]): JapanMapQuestion => ({
  id,
  grade: 4,
  questionType: "prefecture-location",
  prefectureId,
  answer: prefectureId,
  prompt: "問題",
  explanation: "説明",
});

describe("日本地図の出題と当日セッション", () => {
  it("間違えた問題を苦手枠として先に出す", () => {
    const questions = [question("fresh", "tokyo"), question("weak", "osaka")];
    const attempts: StudyAttempt[] = [{
      id: "old-wrong",
      sessionId: "old-session",
      questionId: "weak",
      subject: "japan-map",
      mode: "quiz",
      answer: "tokyo",
      correct: false,
      mistakes: 1,
      usedGuide: false,
      answeredAt: "2026-09-07T10:00:00.000Z",
    }];
    expect(selectJapanMapQuestions(questions, { attempts, limit: 1 }).map((item) => item.id)).toEqual(["weak"]);
  });

  const mapAttempt = (questionId: string, item: string, correct: boolean, answeredAt: string, usedGuide = false): StudyAttempt => ({
    id: `${item}:${answeredAt}`,
    sessionId: `session-${item}`,
    sessionItemId: item,
    questionId,
    subject: "japan-map",
    mode: "quiz",
    answer: "",
    correct,
    mistakes: correct ? 0 : 1,
    usedGuide,
    answeredAt,
  });
  const ids = (selected: JapanMapQuestion[]) => selected.map((item) => item.id);

  it("一度間違えた県も、その後に続けて正解すれば苦手枠から外れる", () => {
    const questions = [question("fresh", "tokyo"), question("recovered", "osaka")];
    const attempts = [
      mapAttempt("recovered", "a", false, "2026-09-01T10:00:00.000Z"),
      mapAttempt("recovered", "a", true, "2026-09-01T10:00:10.000Z"),
      mapAttempt("recovered", "b", true, "2026-09-02T10:00:00.000Z"),
    ];
    expect(ids(selectJapanMapQuestions(questions, { attempts, limit: 1 }))).toEqual(["fresh"]);
  });

  it("同じ問題での誤答クリックは何回でも1回の苦手として数える", () => {
    const questions = [question("fresh", "tokyo"), question("clicked", "osaka")];
    const attempts = [
      mapAttempt("clicked", "a", false, "2026-09-01T10:00:00.000Z"),
      mapAttempt("clicked", "a", false, "2026-09-01T10:00:05.000Z"),
      mapAttempt("clicked", "a", false, "2026-09-01T10:00:10.000Z"),
      mapAttempt("clicked", "a", true, "2026-09-01T10:00:15.000Z"),
      mapAttempt("clicked", "b", true, "2026-09-02T10:00:00.000Z"),
    ];
    expect(ids(selectJapanMapQuestions(questions, { attempts, limit: 1 }))).toEqual(["fresh"]);
  });

  it("苦手が5県以上あるときは古い順に4県を選び、正解した県の次へ移る", () => {
    const questions = ["a", "b", "c", "d", "e", "f"].map((id) => question(id, "tokyo"));
    const attempts = questions.map((item, index) => mapAttempt(item.id, `item-${item.id}`, false, `2026-09-0${index + 1}T10:00:00.000Z`));
    const first = selectJapanMapQuestions(questions, { attempts, limit: 4, seed: "s1" });
    expect(ids(first).sort()).toEqual(["a", "b", "c", "d"]);
    const later = [...attempts, ...ids(first).map((id, index) => mapAttempt(id, `again-${id}`, true, `2026-09-1${index}T10:00:00.000Z`))];
    expect(ids(selectJapanMapQuestions(questions, { attempts: later, limit: 4, seed: "s2" }))).toEqual(expect.arrayContaining(["e", "f"]));
  });

  it("苦手枠の県をセットの先頭に固めない", () => {
    const questions = Array.from({ length: 20 }, (_, index) => question(`q${index}`, "tokyo"));
    const attempts = ["q0", "q1", "q2", "q3"].map((id) => mapAttempt(id, `item-${id}`, false, "2026-09-01T10:00:00.000Z"));
    const firstIds = new Set(["s1", "s2", "s3", "s4", "s5", "s6"].map((seed) => selectJapanMapQuestions(questions, { attempts, seed })[0].id));
    expect([...firstIds].some((id) => !["q0", "q1", "q2", "q3"].includes(id))).toBe(true);
    for (const seed of ["s1", "s2"]) {
      expect(ids(selectJapanMapQuestions(questions, { attempts, seed }))).toEqual(expect.arrayContaining(["q0", "q1", "q2", "q3"]));
    }
  });

  it("回答を保存し、正解で1問進めてポイントを加算する", async () => {
    const storage = new StudyStorage(new IDBFactory(), "japan-map-session-test");
    const questions = [question("q1", "tokyo"), question("q2", "osaka")];
    const session = await startNextJapanMapBatch(storage, questions, "2026-09-08", new Date("2026-09-08T10:00:00.000Z"), "test");
    expect(session).toMatchObject({ id: "2026-09-08:japan-map:quiz:1", currentIndex: 0 });
    if (!session) throw new Error("session was not created");

    const attempt: JapanMapSessionAttempt = {
      id: "map-answer-1",
      sessionId: session.id,
      sessionItemId: session.items[0].id,
      questionId: session.questionIds[0],
      subject: "japan-map",
      mode: "quiz",
      answer: questions.find((item) => item.id === session.questionIds[0])?.prefectureId ?? "",
      correct: true,
      mistakes: 0,
      usedGuide: false,
      firstTryCorrect: true,
      answeredAt: "2026-09-08T10:01:00.000Z",
    };
    await storage.recordJapanMapSessionAttempt(attempt);
    const updated = await storage.getDailySession(session.id);
    expect(updated).toMatchObject({
      currentIndex: 1,
      items: expect.arrayContaining([expect.objectContaining({ status: "completed" })]),
    });
    expect(await storage.getMotivationState()).toMatchObject({ pointsBalance: 1 });
    expect(summarizeJapanMapSession(updated as Extract<typeof updated, { subject: "japan-map" }>)).toEqual({
      firstTryCorrect: 1,
      correctedAfterMistake: 0,
      unknown: 0,
    });
  });
});
