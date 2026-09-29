# Process overview

## What I built

A timetable planner for Semester 2 2026 COMP courses: save a draft, choose a
class for every activity, and see clashes week by week before enrolment.
`README.md` covers what it is and what good means for it.

## How I got here

**Directing: choosing the slice.** I picked the system from my own experience
of it:

> I would like to fix ANU timetabling system

Before building anything, I narrowed it down with four decisions. The pain is
"can't plan before enrolling". The thing that persists is a saved draft
timetable. The scope is every COMP course. The semester is S2 2026, because the
2027 viewer had no COMP classes yet. Those four answers set the data model:
plans, their courses and their picks. They also ruled out everything that looks
like enrolment. I also chose the commit policy: commit freely, but ask me before
every push and every deploy.

**The harness came first.** Before any app code, CLAUDE.md
([`1731d32`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/commit/1731d32))
carried over last crit's general lessons and dropped that crit's content rules.
It added the rules this stack needs: the schema is the ground truth, the volume
outlives every deploy, forms work without JavaScript, CI probes `/api/events`,
and **reference data comes from a source, never from memory**.

**Grounding: real data, from a script.** Following that last rule, the class
times are scraped from ANU's public timetable viewer, not written from memory
([`c77b1de`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/commit/c77b1de)).
The viewer fought back. It's an ASP.NET form, so its postback target had to be
read from the page, and its week ranges use a non-breaking hyphen (U+2011) that
a plain `-` split doesn't find. The hyphen is now a CLAUDE.md lesson, and the
parser is tested on the raw characters.

**The slice, end to end.** One commit holds the whole working flow: schema and
migrations, seeding at boot, form endpoints, the plan page and its week grid
([`8ec0a69`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/commit/8ec0a69)).
The guestbook table is dropped by its own migration so the live volume
migrates cleanly. Next come the spec tests for the flow and the rules
([`5311734`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/commit/5311734)).
Both clash tests were seen to fail with the overlap rule deliberately broken
before they were trusted.

**Correcting: looking, not assuming.** The tests passed first time, so we
checked the rendered page at desktop and at 390×844. That turned up three
things the suite couldn't see:

- one-hour blocks were clipped;
- in a clash, one block's course label had shrunk to nothing;
- the home page's "source" link pointed at a URL with a description glued on.

The last one would have failed CI's link check after the deploy. We fixed it
with a test that fails on the old link
([`08e21fe`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/commit/08e21fe)).
The full run is
[`c77b1de...08e21fe`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/compare/c77b1de...08e21fe).

**Directing from use, after the deploy.** Using the live app, I found myself
scrolling back up to the week after every pick. I asked for:

> change the your week calendar and courses and class selector side-by-side,
> so that users don't have to scroll up and down too much

On a wide screen, the week now stays pinned beside the course list and scrolls
inside itself when the window is short. Phones still stack
([`80593da`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/commit/80593da)).
It was checked by measuring, not by eye: scrolled 1800px down the list, the
week still sits 12px from the top. No page overflow at 1440, 1280, 1150 or 390
wide.

Next I asked for the course cards to be foldable. A folded card hides its
"choose one" tags, so its header now carries the count itself. A spec test
holds that count to the tags inside, and it was seen to fail when the count
also included optional classes. Every save reloads the page, so the folds are
remembered per draft, and a "still to choose" link unfolds the course it
points into
([`1f8c7c6`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-aaronjin0323/commit/1f8c7c6)).

**How I know it's right.** `pnpm check` holds the flow. I held the grid layout
by measuring the rendered page: no horizontal overflow at 390px, and no clipped
block at either width. I hold the data by keeping the scraper committed next to
its output, so anyone can re-take the copy and diff it. Three general lessons
from this week went into CLAUDE.md for next time.
