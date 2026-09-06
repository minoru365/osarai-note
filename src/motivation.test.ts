import { describe, expect, it } from "vitest";
import { getDailyMilestone, getRecentStudyDays } from "./motivation";
import { getLocalDate } from "./dailySession";
import type { StudyAttempt } from "./storage/schema";

function attempt(answeredAt: string): StudyAttempt {
  return {
    id: answeredAt,
    sessionId: "session",
    questionId: "question",
    subject: "kanji",
    mode: "reading",
    answer: "",
    correct: true,
    mistakes: 0,
    usedGuide: false,
    answeredAt,
  };
}

describe("getDailyMilestone", () => {
  it("3・5・10問の小さな目標を順に示す", () => {
    expect(getDailyMilestone(0)).toMatchObject({ completed: 0, next: 3, remaining: 3, progress: 0 });
    expect(getDailyMilestone(3)).toMatchObject({ completed: 3, next: 5, remaining: 2 });
    expect(getDailyMilestone(10)).toMatchObject({ completed: 10, next: null, remaining: 0, progress: 100 });
    expect(getDailyMilestone(12).progress).toBe(100);
  });
});

describe("getRecentStudyDays", () => {
  it("直近7日の学習日を星の表示用に返す", () => {
    const today = new Date(2026, 7, 17, 12, 0, 0);
    const days = getRecentStudyDays([
      attempt(new Date(2026, 7, 11, 9, 0, 0).toISOString()),
      attempt(new Date(2026, 7, 17, 9, 0, 0).toISOString()),
    ], today);

    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ localDate: "2026-08-11", practiced: true });
    expect(days[1]).toEqual({ localDate: "2026-08-12", practiced: false });
    expect(days[6]).toEqual({ localDate: getLocalDate(today), practiced: true });
  });

  it("期間を0にすると空になる", () => {
    expect(getRecentStudyDays([], new Date("2026-08-17T12:00:00.000Z"), 0)).toEqual([]);
  });
});
