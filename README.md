# Timetable planner

ANU publishes its class timetable weeks before enrolment opens, but the only
place to try a timetable out is the enrolment system itself. There you can't
save a draft, and you can't see a clash until you've already committed to a
class. This app is that missing step for COMP courses in Semester 2, 2026.
Start a draft, add courses, and choose a class for every lab, tutorial and
workshop. Each option tells you before you pick it which of your other classes
it would clash with, and in which teaching weeks. Every change is saved, so a
draft is still there when you come back, and a draft open in a second tab
catches up when the first tab changes it.

It models one slice of ANU timetabling end to end. The data is real class times
from the public timetable, and the draft plan is kept in a database. It is not
enrolment, and it can't tell you whether a class still has places.

## What good looks like here

**The times have to be right, or nothing else matters.** Every course, class,
time, week range and room comes from
[ANU's public timetable viewer](https://timetabling.anu.edu.au/sws2026/),
scraped by a committed script (`scripts/scrape-timetable.ts`) into
`data/timetable-2026-s2.json`. None of it was typed in by hand. The copy covers
all 48 COMP offerings for Semester 2 2026: 794 classes and 831 sessions. The
home page says when the copy was taken and links the source, because a planner
that quietly goes stale is worse than none. The 2027 viewer had no COMP classes
when this was built, so 2026 S2 is the most recent full semester available.

**A clash is a fact about weeks, not just hours.** Two classes clash only if
they fall on the same day, their times overlap, and they share at least one
teaching week. Back-to-back classes don't clash. A one-off week-41 workshop
only collides with a weekly lab in week 41, and the app says "weeks 32–36,
39–44" rather than just "clash". This rule lives in `src/lib/timetable.ts` and
is tested on its own in `spec/timetable.test.ts`.

**Planning means seeing a clash before you choose.** Every option lists the
classes it would collide with, given your other picks. That's the question you
actually have ("which tutorial fits?"), and answering it is what the enrolment
system doesn't do.

**It works without JavaScript.** Every change is a plain form POST answered
with a redirect, and the page is re-rendered from the database. Script adds two
things: a mouse click on a class saves it immediately, and other open tabs
reload when the draft changes. Keyboard users keep an explicit Save button,
because arrowing through radio buttons shouldn't submit at every step.

### Enforced, and judgement calls

What `pnpm check` enforces (`spec/`):

- a draft keeps its courses and picks across a fresh request;
- single-option activities fill themselves in;
- a clash is flagged, with its weeks;
- a class that doesn't belong to the activity, or a pick for a course not in
  the draft, is refused;
- removing a course removes its picks;
- rename and delete work;
- the plan page passes the same accessibility invariants as the static pages;
- the week and clash rules hold on the viewer's raw text, including its
  non-breaking hyphens.

Judgement calls, made while reading the scraped data:

- **Drop-in and makeup classes are optional.** The viewer lists them as
  activities, but nobody is allocated to them. They're labelled "optional" and
  don't count as unfinished.
- **Assessment slots count as required.** Some courses list a mid-semester exam
  as an activity with one room per option. You are allocated to one, so the app
  asks you to choose.
- **An activity with one option is not a choice.** Adding a course fills in its
  lectures (and anything else with only one stream) straight away.
- **The grid shows every picked class, whatever weeks it runs.** Classes that
  overlap in time sit side by side even when they never meet in the same week.
  The clash list, not the grid, is what decides whether there's a clash.

### What I chose not to build

- Accounts, or sharing a draft with someone. Every draft is visible to anyone
  with the link.
- Courses outside COMP, other semesters, or other ANU campuses.
- A per-week view of the grid.
- Class capacity, prerequisites, or anything else that needs enrolment data
  the public viewer doesn't publish.
- Refreshing the data automatically. The copy is re-taken by running
  the scraper, which keeps every draft's picks even if a class disappears.
