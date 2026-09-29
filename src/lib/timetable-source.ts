// Reading rows out of ANU's public class timetable (the list report of
// timetabling.anu.edu.au). Used by scripts/scrape-timetable.ts; kept apart
// from the scraper so the parsing can be tested on the viewer's real text.
import { DAYS, parseWeeks } from "./timetable.ts";

// The viewer writes ranges with U+2011 NON-BREAKING HYPHEN ("32‑36"), which
// looks like "-" and splits on nothing a "-" split finds. Normalise here, at
// the boundary, so nothing downstream ever sees it.
const normalise = (text: string) => text.replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim();

const minutes = (hhmm: string): number => {
  const match = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`unreadable time "${hhmm}"`);
  return Number(match[1]) * 60 + Number(match[2]);
};

/** One row of the list report: Activity, Day, Start, Finish, Duration,
 *  Weeks, Activity Type, Location, Notes. The activity cell names the
 *  course offering, the activity and the class option at once —
 *  "COMP2100_S2_(01)-ComA/03" is option 03 of computer lab ComA. */
export function parseClassRow(raw: string[]) {
  const [activity, day, start, finish, , weeks, type, location] = raw.map(normalise);
  const match = activity.match(/^([A-Z]{4}\d{4}_S\d_\(\d+\))-([A-Za-z]+)\/(\d+)$/);
  if (!match) throw new Error(`unreadable activity "${activity}"`);
  const dayNumber = DAYS.indexOf(day) + 1;
  if (dayNumber === 0) throw new Error(`unreadable day "${day}"`);
  // The weeks cell is "32-36,39-44 4 Aug 26 - 1 Sep 26, …": the week
  // numbers come first, and the dates after them say the same thing again.
  const weekRange = weeks.split(" ")[0];
  parseWeeks(weekRange); // throws on anything unreadable, so bad data fails the scrape

  return {
    activityId: `${match[1]}-${match[2]}`,
    activityCode: match[2],
    classId: activity,
    activityType: type,
    day: dayNumber,
    start: minutes(start),
    end: minutes(finish),
    weeks: weekRange,
    location,
  };
}
