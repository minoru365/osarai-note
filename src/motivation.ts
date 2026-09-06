import { getLocalDate } from "./dailySession";
import type { StudyAttempt } from "./storage/schema";

export const DAILY_MILESTONES = [3, 5, 10] as const;

export type DailyMilestone = {
  completed: number;
  next: number | null;
  remaining: number;
  progress: number;
};

/**
 * Small, medium, and stretch goals are derived from today's completed items.
 * Nothing is persisted and the value never reduces a child's points or score.
 */
export function getDailyMilestone(completed: number): DailyMilestone {
  const safeCompleted = Math.max(0, Math.floor(completed));
  const next = DAILY_MILESTONES.find((milestone) => milestone > safeCompleted) ?? null;
  const stretchTarget = DAILY_MILESTONES[DAILY_MILESTONES.length - 1];
  return {
    completed: safeCompleted,
    next,
    remaining: next === null ? 0 : next - safeCompleted,
    progress: Math.min(100, Math.round((safeCompleted / stretchTarget) * 100)),
  };
}

export type RecentStudyDay = {
  localDate: string;
  practiced: boolean;
};

/** A calm seven-day look-back; it intentionally does not create a streak. */
export function getRecentStudyDays(
  attempts: StudyAttempt[],
  today = new Date(),
  span = 7,
): RecentStudyDay[] {
  const safeSpan = Math.max(0, Math.floor(span));
  const practicedDates = new Set(
    attempts
      .map((attempt) => new Date(attempt.answeredAt))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => getLocalDate(date)),
  );

  return Array.from({ length: safeSpan }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (safeSpan - index - 1));
    const localDate = getLocalDate(date);
    return { localDate, practiced: practicedDates.has(localDate) };
  });
}
