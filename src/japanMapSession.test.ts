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
