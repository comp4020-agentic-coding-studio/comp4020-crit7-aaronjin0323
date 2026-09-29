// The timetable's domain rules, kept free of the database and the page so
// they can be tested on their own: what a week range means, and when two
// classes clash.

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "32-36,39-44" → [32, 33, 34, 35, 36, 39, …, 44]. Calendar weeks, as the
 *  ANU viewer numbers them. */
export function parseWeeks(weeks: string): number[] {
  const out = new Set<number>();
  for (const part of weeks.split(",")) {
    const [from, to = from] = part.trim().split("-").map(Number);
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) {
      throw new Error(`unreadable week range "${weeks}"`);
    }
    for (let week = from; week <= to; week++) out.add(week);
  }
  return [...out].sort((a, b) => a - b);
}

/** Minutes since midnight → "14:00". */
export function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export interface PickedSession {
  classId: string;
  courseCode: string;
  activityCode: string;
  day: number; // 1 = Monday … 7 = Sunday
  start: number; // minutes since midnight
  end: number;
  weeks: string;
  location: string;
}

export interface Clash {
  a: PickedSession;
  b: PickedSession;
  /** The calendar weeks both meet in — a clash only happens in these. */
  weeks: number[];
}

/** Two sessions clash when they're on the same day, their times overlap
 *  (back-to-back is fine), and they share at least one teaching week — a
 *  one-off workshop only collides with a weekly lab in the workshop's week. */
export function findClashes(sessions: PickedSession[]): Clash[] {
  const clashes: Clash[] = [];
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i];
      const b = sessions[j];
      if (a.classId === b.classId) continue;
      if (a.day !== b.day || a.start >= b.end || b.start >= a.end) continue;
      const bWeeks = new Set(parseWeeks(b.weeks));
      const shared = parseWeeks(a.weeks).filter((week) => bWeeks.has(week));
      if (shared.length > 0) clashes.push({ a, b, weeks: shared });
    }
  }
  return clashes;
}

/** "32-36,39-44" as a reader wants it: "weeks 32–36, 39–44". */
export function describeWeeks(weeks: number[]): string {
  const runs: string[] = [];
  let start = weeks[0];
  for (let i = 1; i <= weeks.length; i++) {
    if (weeks[i] !== weeks[i - 1] + 1) {
      const end = weeks[i - 1];
      runs.push(start === end ? `${start}` : `${start}–${end}`);
      start = weeks[i];
    }
  }
  return `${weeks.length === 1 ? "week" : "weeks"} ${runs.join(", ")}`;
}
