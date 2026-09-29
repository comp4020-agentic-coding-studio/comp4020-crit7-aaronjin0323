#!/usr/bin/env node
// Pulls every COMP offering for one semester out of ANU's public class
// timetable (the Scientia "SWS" viewer at timetabling.anu.edu.au) and writes
// it to data/, which is what the app seeds its reference tables from. The
// class times in the app are only ever what this script recorded: re-run it
// to refresh them, and commit the JSON it writes.
//
//   node scripts/scrape-timetable.ts            # 2026 Semester 2, COMP
//
// The viewer is an ASP.NET WebForms app, so each step is a form post that
// carries the previous page's hidden state (__VIEWSTATE and friends).
import { mkdirSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { parseClassRow } from "../src/lib/timetable-source.ts";

const YEAR = 2026;
const SEMESTER = "S2";
const SUBJECT = "COMP";
const WEEKS = "29-46"; // the viewer's own "Semester 2" week range
const BASE = `https://timetabling.anu.edu.au/sws${YEAR}/`;
const OUT = `data/timetable-${YEAR}-${SEMESTER.toLowerCase()}.json`;
const BATCH = 10;

let cookie = "";

async function request(url: string, form?: Record<string, string | string[]>) {
  let body: URLSearchParams | undefined;
  if (form) {
    body = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
      for (const v of Array.isArray(value) ? value : [value]) body.append(key, v);
    }
  }
  const res = await fetch(url, {
    method: form ? "POST" : "GET",
    body,
    headers: { cookie, "user-agent": "comp4020-timetable-planner (student project)" },
  });
  const set = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  if (set.length) cookie = set.join("; ");
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return { url: res.url, doc: new JSDOM(await res.text()).window.document };
}

/** The page's own form state: hidden and text inputs, as the browser would post them. */
function state(doc: Document): Record<string, string> {
  const out: Record<string, string> = {};
  for (const input of doc.querySelectorAll<HTMLInputElement>("input[type=hidden], input[type=text]")) {
    if (input.name) out[input.name] = input.value;
  }
  return out;
}

function options(doc: Document, select: string): string[] {
  return [...doc.querySelectorAll<HTMLOptionElement>(`select[name=${select}] option`)].map(
    (o) => o.value,
  );
}

async function offerings(): Promise<{ doc: Document; codes: string[] }> {
  const home = await request(BASE);
  const courses = await request(BASE, {
    ...state(home.doc),
    __EVENTTARGET: "LinkBtn_modules",
    __EVENTARGUMENT: "",
  });
  const filtered = await request(BASE, {
    ...state(courses.doc),
    tLinkType: "modules",
    tWildcard: SUBJECT,
    bWildcard: "Filter",
  });
  const codes = options(filtered.doc, "dlObject").filter((v) =>
    new RegExp(`^${SUBJECT}\\d{4}_${SEMESTER}$`).test(v),
  );
  return { doc: filtered.doc, codes };
}

type Session = ReturnType<typeof parseClassRow>;

async function main() {
  const { doc, codes } = await offerings();
  if (codes.length === 0) throw new Error(`no ${SUBJECT} ${SEMESTER} offerings in ${YEAR}`);
  console.log(`${codes.length} ${SUBJECT} ${SEMESTER} offerings`);

  const courses: {
    code: string;
    offering: string;
    title: string;
    activities: Map<string, { id: string; code: string; type: string; classes: Map<string, Session[]> }>;
  }[] = [];

  for (let i = 0; i < codes.length; i += BATCH) {
    const batch = codes.slice(i, i + BATCH);
    // Every report request starts from a fresh filtered page, because the
    // viewer's hidden state is single-use.
    const fresh = i === 0 ? doc : (await offerings()).doc;
    const report = await request(BASE, {
      ...state(fresh),
      tLinkType: "modules",
      dlObject: batch,
      lbWeeks: WEEKS,
      lbDays: "1-7;1;2;3;4;5;6;7",
      dlPeriod: `1-32;${Array.from({ length: 32 }, (_, n) => n + 1).join(";")};`,
      RadioType: "module_list;cyon_reports_list_url;dummy",
      bGetTimetable: "View Timetable",
    });
    if (!report.url.includes("/Reports/List.aspx")) {
      throw new Error(`expected the list report, got ${report.url}`);
    }

    // Each offering renders as a collapsible block whose first <h3> is
    // "COMP2100_S2_(01)&nbsp;Software Construction (Class:8676)", followed
    // by its table of classes as the next sibling.
    for (const block of report.doc.querySelectorAll("div[data-role=collapsible]")) {
      const heading = block.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const match = heading.match(/^(([A-Z]{4}\d{4})_S\d_\(\d+\)) (.+) \(Class:\d+\)$/);
      const table = block.nextElementSibling;
      if (!match || !table?.matches("table.cyon_table")) {
        throw new Error(`unexpected report shape near "${heading}"`);
      }
      const [, offering, code, title] = match;

      const course = { code, offering, title: title.trim(), activities: new Map() };
      for (const tr of table.querySelectorAll("tbody tr")) {
        const cells = [...tr.querySelectorAll("td")].map((td) => td.textContent ?? "");
        if (cells.length < 8) continue;
        const row = parseClassRow(cells);
        const activity = course.activities.get(row.activityId) ?? {
          id: row.activityId,
          code: row.activityCode,
          type: row.activityType,
          classes: new Map(),
        };
        const sessions = activity.classes.get(row.classId) ?? [];
        sessions.push(row);
        activity.classes.set(row.classId, sessions);
        course.activities.set(row.activityId, activity);
      }
      if (course.activities.size > 0) courses.push(course);
    }
    console.log(`  ${Math.min(i + BATCH, codes.length)}/${codes.length}`);
  }

  const data = {
    source: `${BASE} (list report, ${SUBJECT}, ${SEMESTER}, weeks ${WEEKS})`,
    year: YEAR,
    semester: SEMESTER,
    scrapedAt: new Date().toISOString(),
    courses: courses
      .sort((a, b) => a.offering.localeCompare(b.offering))
      .map((c) => ({
        code: c.code,
        offering: c.offering,
        title: c.title,
        activities: [...c.activities.values()].map((a) => ({
          id: a.id,
          code: a.code,
          type: a.type,
          classes: [...a.classes.entries()].map(([id, sessions]) => ({
            id,
            sessions: sessions.map(({ day, start, end, weeks, location }) => ({
              day,
              start,
              end,
              weeks,
              location,
            })),
          })),
        })),
      })),
  };

  mkdirSync("data", { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(data, null, 2)}\n`);
  const classes = data.courses.flatMap((c) => c.activities.flatMap((a) => a.classes)).length;
  console.log(`wrote ${OUT}: ${data.courses.length} courses, ${classes} classes`);
}

await main();
