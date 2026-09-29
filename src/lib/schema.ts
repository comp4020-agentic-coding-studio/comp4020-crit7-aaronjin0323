import { sql } from "drizzle-orm";
import { index, int, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.

// --- Reference data: ANU's timetable, as scripts/scrape-timetable.ts
// recorded it. Keyed by the timetable's own codes, so a re-scrape updates
// rows in place and never orphans a saved plan's picks.

/** A course offering: "COMP2100_S2_(01)". */
export const courses = sqliteTable("courses", {
  id: text().primaryKey(),
  code: text().notNull(), // "COMP2100"
  title: text().notNull(),
});

/** Something a student attends, with one or more options to choose from:
 *  "COMP2100_S2_(01)-ComA" is its computer lab. */
export const activities = sqliteTable(
  "activities",
  {
    id: text().primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    code: text().notNull(), // "ComA"
    type: text().notNull(), // "Computer Laboratory"
    // Drop-ins and makeups are there if you want them; nothing to pick.
    optional: int({ mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("activities_course_idx").on(t.courseId)],
);

/** One option for an activity: "COMP2100_S2_(01)-ComA/03". */
export const classes = sqliteTable(
  "classes",
  {
    id: text().primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id),
  },
  (t) => [index("classes_activity_idx").on(t.activityId)],
);

/** When and where a class meets. Most classes have one session; some are
 *  recorded as several (a different room one week, say). */
export const sessions = sqliteTable(
  "sessions",
  {
    id: int().primaryKey({ autoIncrement: true }),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id),
    day: int().notNull(), // 1 = Monday … 7 = Sunday
    start: int().notNull(), // minutes since midnight
    end: int().notNull(),
    weeks: text().notNull(), // calendar weeks, "32-36,39-44"
    location: text().notNull(),
  },
  (t) => [index("sessions_class_idx").on(t.classId)],
);

// --- The student's state: draft timetables.

/** A named "what if I took these" plan. */
export const plans = sqliteTable("plans", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

/** The courses a plan is trying out. */
export const planCourses = sqliteTable(
  "plan_courses",
  {
    planId: int("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
  },
  (t) => [primaryKey({ columns: [t.planId, t.courseId] })],
);

/** The option a plan has chosen for one activity — at most one each. */
export const planPicks = sqliteTable(
  "plan_picks",
  {
    planId: int("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id),
  },
  (t) => [primaryKey({ columns: [t.planId, t.activityId] })],
);

export type Plan = typeof plans.$inferSelect;
export type Course = typeof courses.$inferSelect;
