import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import timetable from "../../data/timetable-2026-s2.json";
import {
  activities,
  classes,
  courses,
  type Plan,
  planCourses,
  planPicks,
  plans,
  sessions,
} from "./schema";
import type { PickedSession } from "./timetable";

// One SQLite file is the app's whole persistent state. In production
// fly.toml points DATABASE_PATH at the machine's volume (/data), which is
// how state survives a reload and a redeploy; locally it defaults to an
// untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");
client.pragma("foreign_keys = ON");

export const db = drizzle(client);

// Migrations run at boot, on whatever machine holds the volume — the
// recommended shape for SQLite on Fly, where there's no separate machine to
// run them from. The flow: edit src/lib/schema.ts, `pnpm db:generate`,
// commit the migration it writes to drizzle/.
migrate(db, { migrationsFolder: "./drizzle" });

export const TIMETABLE = {
  year: timetable.year,
  semester: timetable.semester,
  source: timetable.source,
  scrapedAt: timetable.scrapedAt,
};

// Drop-ins and makeups are offered, not allocated: a plan never has to
// choose one, so they don't count as unfinished.
const OPTIONAL_TYPE = /drop-in|makeup/i;

// The reference tables are loaded from the committed scrape on every boot,
// upserting on the timetable's own codes. Classes are never deleted, so a
// re-scrape that drops one can't break a plan that picked it; its sessions
// are replaced, because nothing points at a session.
function seedTimetable() {
  db.transaction((tx) => {
    for (const course of timetable.courses) {
      tx.insert(courses)
        .values({ id: course.offering, code: course.code, title: course.title })
        .onConflictDoUpdate({ target: courses.id, set: { code: course.code, title: course.title } })
        .run();
      for (const activity of course.activities) {
        const row = {
          courseId: course.offering,
          code: activity.code,
          type: activity.type,
          optional: OPTIONAL_TYPE.test(activity.type),
        };
        tx.insert(activities)
          .values({ id: activity.id, ...row })
          .onConflictDoUpdate({ target: activities.id, set: row })
          .run();
        for (const option of activity.classes) {
          tx.insert(classes)
            .values({ id: option.id, activityId: activity.id })
            .onConflictDoUpdate({ target: classes.id, set: { activityId: activity.id } })
            .run();
          tx.delete(sessions).where(eq(sessions.classId, option.id)).run();
          for (const session of option.sessions) {
            tx.insert(sessions)
              .values({ classId: option.id, ...session })
              .run();
          }
        }
      }
    }
  });
}
seedTimetable();

export type { Plan };

const now = () => new Date().toISOString();

const touch = (planId: number) =>
  db.update(plans).set({ updatedAt: now() }).where(eq(plans.id, planId)).returning().get();

// --- Plans

export function listPlans() {
  return db
    .select({
      id: plans.id,
      name: plans.name,
      updatedAt: plans.updatedAt,
      courses: count(planCourses.courseId),
    })
    .from(plans)
    .leftJoin(planCourses, eq(planCourses.planId, plans.id))
    .groupBy(plans.id)
    .orderBy(desc(plans.updatedAt), desc(plans.id))
    .all();
}

export function createPlan(name: string): Plan {
  const stamp = now();
  return db.insert(plans).values({ name, createdAt: stamp, updatedAt: stamp }).returning().get();
}

export function getPlan(id: number): Plan | undefined {
  return db.select().from(plans).where(eq(plans.id, id)).get();
}

export function renamePlan(id: number, name: string): Plan | undefined {
  return db.update(plans).set({ name, updatedAt: now() }).where(eq(plans.id, id)).returning().get();
}

export function deletePlan(id: number): void {
  db.delete(plans).where(eq(plans.id, id)).run();
}

// --- Courses in a plan

export function listCourses() {
  return db.select().from(courses).orderBy(asc(courses.code), asc(courses.id)).all();
}

/** Add a course, and fill in every activity that has only one option — a
 *  lecture with one stream isn't a choice. Returns false if the course or
 *  plan doesn't exist. */
export function addCourse(planId: number, courseId: string): boolean {
  if (!getPlan(planId)) return false;
  if (!db.select().from(courses).where(eq(courses.id, courseId)).get()) return false;
  db.transaction((tx) => {
    tx.insert(planCourses).values({ planId, courseId }).onConflictDoNothing().run();
    const single = tx
      .select({ activityId: classes.activityId, classId: classes.id, n: count() })
      .from(classes)
      .innerJoin(activities, eq(activities.id, classes.activityId))
      .where(and(eq(activities.courseId, courseId), eq(activities.optional, false)))
      .groupBy(classes.activityId)
      .all()
      .filter((row) => row.n === 1);
    for (const { activityId, classId } of single) {
      tx.insert(planPicks).values({ planId, activityId, classId }).onConflictDoNothing().run();
    }
  });
  touch(planId);
  return true;
}

export function removeCourse(planId: number, courseId: string): void {
  db.transaction((tx) => {
    const owned = tx
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.courseId, courseId))
      .all()
      .map((a) => a.id);
    if (owned.length) {
      tx.delete(planPicks)
        .where(and(eq(planPicks.planId, planId), inArray(planPicks.activityId, owned)))
        .run();
    }
    tx.delete(planCourses)
      .where(and(eq(planCourses.planId, planId), eq(planCourses.courseId, courseId)))
      .run();
  });
  touch(planId);
}

/** Choose an option for an activity. Refuses a class that isn't an option
 *  of that activity, or an activity whose course isn't in the plan — a form
 *  can be replayed with any values, so the database state is checked, not
 *  trusted. An empty classId clears the pick. */
export function pickClass(planId: number, activityId: string, classId: string): boolean {
  const activity = db
    .select({ courseId: activities.courseId })
    .from(activities)
    .innerJoin(
      planCourses,
      and(eq(planCourses.courseId, activities.courseId), eq(planCourses.planId, planId)),
    )
    .where(eq(activities.id, activityId))
    .get();
  if (!activity) return false;
  if (classId === "") {
    db.delete(planPicks)
      .where(and(eq(planPicks.planId, planId), eq(planPicks.activityId, activityId)))
      .run();
  } else {
    const option = db
      .select()
      .from(classes)
      .where(and(eq(classes.id, classId), eq(classes.activityId, activityId)))
      .get();
    if (!option) return false;
    db.insert(planPicks)
      .values({ planId, activityId, classId })
      .onConflictDoUpdate({ target: [planPicks.planId, planPicks.activityId], set: { classId } })
      .run();
  }
  touch(planId);
  return true;
}

// --- Reading a plan back

export interface SessionView {
  day: number;
  start: number;
  end: number;
  weeks: string;
  location: string;
}

export interface ActivityView {
  id: string;
  code: string;
  type: string;
  optional: boolean;
  options: { id: string; number: string; sessions: SessionView[] }[];
  picked: string | null;
}

export interface CourseView {
  id: string;
  code: string;
  title: string;
  activities: ActivityView[];
}

/** Everything the plan page shows: each course, its activities with every
 *  option, and which one is picked — plus the picked sessions flattened for
 *  the week grid and the clash check. */
export function planDetail(planId: number) {
  const inPlan = db
    .select({ id: courses.id, code: courses.code, title: courses.title })
    .from(planCourses)
    .innerJoin(courses, eq(courses.id, planCourses.courseId))
    .where(eq(planCourses.planId, planId))
    .orderBy(asc(courses.code))
    .all();
  const courseIds = inPlan.map((c) => c.id);
  if (courseIds.length === 0) return { courses: [] as CourseView[], picked: [] as PickedSession[] };

  const acts = db
    .select()
    .from(activities)
    .where(inArray(activities.courseId, courseIds))
    .orderBy(asc(activities.id))
    .all();
  const rows = db
    .select({
      classId: classes.id,
      activityId: classes.activityId,
      day: sessions.day,
      start: sessions.start,
      end: sessions.end,
      weeks: sessions.weeks,
      location: sessions.location,
    })
    .from(classes)
    .innerJoin(sessions, eq(sessions.classId, classes.id))
    .innerJoin(activities, eq(activities.id, classes.activityId))
    .where(inArray(activities.courseId, courseIds))
    .orderBy(asc(classes.id), asc(sessions.day), asc(sessions.start))
    .all();
  const picks = new Map(
    db
      .select()
      .from(planPicks)
      .where(eq(planPicks.planId, planId))
      .all()
      .map((p) => [p.activityId, p.classId]),
  );

  const options = new Map<string, ActivityView["options"]>();
  for (const row of rows) {
    const list = options.get(row.activityId) ?? [];
    let option = list.find((o) => o.id === row.classId);
    if (!option) {
      option = { id: row.classId, number: row.classId.split("/").at(-1) ?? row.classId, sessions: [] };
      list.push(option);
    }
    const { day, start, end, weeks, location } = row;
    option.sessions.push({ day, start, end, weeks, location });
    options.set(row.activityId, list);
  }

  const views: CourseView[] = inPlan.map((course) => ({
    ...course,
    activities: acts
      .filter((a) => a.courseId === course.id)
      .map((a) => ({
        id: a.id,
        code: a.code,
        type: a.type,
        optional: a.optional,
        options: options.get(a.id) ?? [],
        picked: picks.get(a.id) ?? null,
      })),
  }));

  const picked: PickedSession[] = views.flatMap((course) =>
    course.activities.flatMap((activity) =>
      activity.options
        .filter((option) => option.id === activity.picked)
        .flatMap((option) =>
          option.sessions.map((s) => ({
            classId: option.id,
            courseCode: course.code,
            activityCode: activity.code,
            ...s,
            fixed: !activity.optional && activity.options.length === 1,
          })),
        ),
    ),
  );

  return { courses: views, picked };
}

/** Every course's classes that can't be moved (the only option of a required
 *  activity), keyed by course id: what adding a course brings with it before
 *  anything is chosen. */
export function fixedSessions(): Map<string, PickedSession[]> {
  const rows = db
    .select({
      courseId: courses.id,
      courseCode: courses.code,
      activityId: activities.id,
      activityCode: activities.code,
      optional: activities.optional,
      classId: classes.id,
      day: sessions.day,
      start: sessions.start,
      end: sessions.end,
      weeks: sessions.weeks,
      location: sessions.location,
    })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(activities, eq(activities.id, classes.activityId))
    .innerJoin(courses, eq(courses.id, activities.courseId))
    .all();
  const options = new Map<string, Set<string>>();
  for (const row of rows) options.set(row.activityId, (options.get(row.activityId) ?? new Set()).add(row.classId));

  const fixed = new Map<string, PickedSession[]>();
  for (const { courseId, activityId, optional, ...session } of rows) {
    if (optional || options.get(activityId)?.size !== 1) continue;
    fixed.set(courseId, [...(fixed.get(courseId) ?? []), { ...session, fixed: true }]);
  }
  return fixed;
}
