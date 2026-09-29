# Process overview

## What I built

A timetable planner for Semester 2 2026 COMP courses: save a draft, choose a
class for every activity, and see clashes before enrolment.

## How I got here

**Directing.** I started from my own frustration:

> I would like to fix ANU timetabling system

Four decisions scoped it: the pain is "can't plan before enrolling", the saved
thing is a draft timetable, the scope is every COMP course, and the semester is
S2 2026, since the 2027 viewer had no COMP classes yet. CLAUDE.md came before
any code, with the rule that reference data comes from a source, never from
memory
([`1731d32`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/commit/1731d32)).

**Grounding.** A committed script scrapes the class times from ANU's public
timetable viewer
([`c77b1de`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/commit/c77b1de)).
Its week ranges use a non-breaking hyphen (U+2011), so the parser is tested
on the raw characters.

**Correcting by looking.** The tests passed first time, but the rendered page
showed clipped one-hour blocks and a broken source link. The link got a test
that fails on the old URL
([`08e21fe`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/commit/08e21fe)).
After the deploy, using the app drove the rest: the week beside the course
list, foldable courses and activities, and a restyle taken from anu.edu.au's
stylesheet
([`08e21fe...e12bd95`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/compare/08e21fe...e12bd95)).

**Correcting a rule.** Then I asked:

> what about 2 lecture clashes in one same time slot? There is no choice for
> lecture time

The app told me to fix a lecture that had no alternative. The data agreed: every S2 lecture has one stream, and 216 course
pairs collide that way. Those clashes are now listed as "can't be avoided", and
"Add a course" warns before you add one. Both tests were seen to fail first
([`db72d69`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/commit/db72d69)).

**How I know it's right.** `pnpm check` holds the flow and the rules, and
measured screenshots hold the layout at 390px and desktop. Five general lessons
went into CLAUDE.md
([`6e55f66`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/commit/6e55f66),
[`aa6fd96`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/commit/aa6fd96)).
