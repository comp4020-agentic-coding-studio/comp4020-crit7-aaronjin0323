import { describe, expect, it } from "vitest";
import { describeWeeks, findClashes, type PickedSession, parseWeeks } from "../src/lib/timetable";
import { parseClassRow } from "../src/lib/timetable-source";

// The domain rules on their own, no server: what a week range means, when two
// classes clash, and how a row of the ANU viewer becomes a class.

const session = (over: Partial<PickedSession>): PickedSession => ({
  classId: "X/01",
  courseCode: "COMP1000",
  activityCode: "TutA",
  day: 2,
  start: 600,
  end: 720,
  weeks: "31-36,39-44",
  location: "CSIT N113",
  ...over,
});

describe("parseWeeks", () => {
  it("expands ranges and single weeks", () => {
    expect(parseWeeks("31-33,36")).toEqual([31, 32, 33, 36]);
  });

  it("refuses the non-breaking hyphen the viewer serves, rather than misreading it", () => {
    // U+2011, as scraped — parseClassRow normalises it before this sees it
    expect(() => parseWeeks("32‑36")).toThrow(/unreadable/);
  });
});

describe("findClashes", () => {
  it("flags overlapping times on the same day in shared weeks", () => {
    const clashes = findClashes([
      session({ classId: "A/01" }),
      session({ classId: "B/01", start: 660, end: 780, weeks: "36-40" }),
    ]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].weeks).toEqual([36, 39, 40]);
  });

  it("lets back-to-back classes through", () => {
    expect(findClashes([session({ classId: "A/01" }), session({ classId: "B/01", start: 720, end: 840 })])).toEqual([]);
  });

  it("lets the same slot through when the weeks never meet", () => {
    expect(
      findClashes([session({ classId: "A/01", weeks: "31-35" }), session({ classId: "B/01", weeks: "36" })]),
    ).toEqual([]);
  });

  it("ignores different days", () => {
    expect(findClashes([session({ classId: "A/01" }), session({ classId: "B/01", day: 3 })])).toEqual([]);
  });
});

describe("describeWeeks", () => {
  it("collapses runs", () => {
    expect(describeWeeks([31, 32, 33, 36, 39, 40])).toBe("weeks 31–33, 36, 39–40");
    expect(describeWeeks([36])).toBe("week 36");
  });
});

describe("parseClassRow", () => {
  it("reads a raw viewer row, U+2011 and all", () => {
    const row = parseClassRow([
      "COMP2100_S2_(01)-ComA/03",
      "Tuesday",
      "09:00",
      "11:00",
      "2:00",
      "31‑36,38‑43 28 Jul 26‑1 Sep 26",
      "Computer Laboratory",
      "CSIT N113",
    ]);
    expect(row.location).toBe("CSIT N113");
    expect(row.activityId).toBe("COMP2100_S2_(01)-ComA");
    expect(row.classId).toBe("COMP2100_S2_(01)-ComA/03");
    expect(row.day).toBe(2);
    expect(row.start).toBe(540);
    expect(row.end).toBe(660);
    expect(parseWeeks(row.weeks)).toContain(38);
  });
});
