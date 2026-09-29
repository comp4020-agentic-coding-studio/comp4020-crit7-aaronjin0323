import axe from "axe-core";
import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

// The core flow against the running app: start a draft, add courses, choose
// classes, and find all of it still there on a fresh request — the "persists
// across a reload" the brief asks for. Real codes from the committed scrape.
const baseUrl = inject("baseUrl");

// Astro refuses a cross-site form POST; a browser sends Origin, fetch doesn't.
async function post(path: string, fields: Record<string, string>) {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin: baseUrl, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
    redirect: "manual",
  });
}

async function page(path: string) {
  const res = await fetch(new URL(path, baseUrl));
  const dom = new JSDOM(await res.text(), { url: new URL(path, baseUrl).href, runScripts: "outside-only" });
  return { status: res.status, dom, doc: dom.window.document };
}

async function newPlan(name: string) {
  const res = await post("/api/plans", { name });
  expect(res.status).toBe(303);
  const location = res.headers.get("location") ?? "";
  expect(location).toMatch(/^\/plans\/\d+$/);
  return location;
}

const checked = (doc: Document, activity: string) =>
  (doc.querySelector(`form.pick input[name="activity"][value="${activity}"]`)?.closest("form")
    ?.querySelector("input[name=class]:checked") as HTMLInputElement | null)?.value;

describe("a draft timetable", () => {
  it("is listed on the home page once started", async () => {
    const plan = await newPlan("Listed draft");
    const { doc } = await page("/");
    const link = [...doc.querySelectorAll(".plans a")].find((a) => a.getAttribute("href") === plan);
    expect(link?.textContent).toBe("Listed draft");
  });

  it("keeps its courses and choices across a reload", async () => {
    const plan = await newPlan("Persisting draft");
    const action = `/api${plan}`;

    const add = await post(action, { intent: "add-course", course: "COMP2100_S2_(01)" });
    expect(add.status).toBe(303);
    expect(add.headers.get("location")).toBe(`${plan}#COMP2100-S2--01-`);

    const pick = await post(action, {
      intent: "pick",
      activity: "COMP2100_S2_(01)-ComA",
      class: "COMP2100_S2_(01)-ComA/03",
    });
    expect(pick.status).toBe(303);

    // a fresh request, so everything below comes from the database
    const { doc } = await page(plan);
    expect(doc.querySelector("h1")?.textContent).toBe("Persisting draft");
    expect(doc.querySelector("#courses h3")?.textContent).toMatch(/COMP2100\s+Software Construction/);
    expect(checked(doc, "COMP2100_S2_(01)-ComA")).toBe("COMP2100_S2_(01)-ComA/03");
    const blocks = [...doc.querySelectorAll(".session strong")].map((b) => b.textContent);
    expect(blocks).toContain("COMP2100 ComA/03");
  });

  it("fills in activities that have only one option", async () => {
    const plan = await newPlan("Auto-picked");
    await post(`/api${plan}`, { intent: "add-course", course: "COMP2100_S2_(01)" });
    const { doc } = await page(plan);
    const lectures = [...doc.querySelectorAll("form.pick")].filter(
      (form) => form.querySelectorAll("input[name=class]").length === 2,
    );
    expect(lectures.length).toBeGreaterThan(0);
    for (const form of lectures) {
      expect((form.querySelector("input[name=class]:checked") as HTMLInputElement).value).not.toBe("");
    }
  });

  it("flags a clash, and names the weeks it happens in", async () => {
    // Adding two courses auto-picks their lectures; the page then warns which
    // lab options would land on one. Choosing a warned option must produce
    // exactly the clash it warned about.
    const plan = await newPlan("Clashing draft");
    const action = `/api${plan}`;
    await post(action, { intent: "add-course", course: "COMP2100_S2_(01)" });
    await post(action, { intent: "add-course", course: "COMP2120_S2_(01)" });

    const { doc } = await page(plan);
    const clash = doc.querySelector(".options .warn");
    expect(clash, "some option should warn that it clashes with a current pick").toBeTruthy();
    const input = clash?.closest("li")?.querySelector("input") as HTMLInputElement;
    const form = input.closest("form") as HTMLFormElement;
    const activity = (form.querySelector("input[name=activity]") as HTMLInputElement).value;
    await post(action, { intent: "pick", activity, class: input.value });

    const after = await page(plan);
    expect(after.doc.querySelectorAll(".session.is-clash").length).toBeGreaterThanOrEqual(2);
    expect(after.doc.querySelector(".problems li")?.textContent).toMatch(/overlap .*weeks? \d+/);
    expect(after.doc.querySelector(".tally .is-clash")?.textContent).toMatch(/^\d+ clash(es)?$/);
  });

  it("refuses a class that isn't an option of the activity", async () => {
    const plan = await newPlan("Tampered draft");
    const action = `/api${plan}`;
    await post(action, { intent: "add-course", course: "COMP2100_S2_(01)" });
    const res = await post(action, {
      intent: "pick",
      activity: "COMP2100_S2_(01)-ComA",
      class: "COMP2120_S2_(01)-TutA/01",
    });
    expect(res.status).toBe(400);
  });

  it("refuses a pick for a course that isn't in the draft", async () => {
    const plan = await newPlan("Wrong course");
    const res = await post(`/api${plan}`, {
      intent: "pick",
      activity: "COMP2100_S2_(01)-ComA",
      class: "COMP2100_S2_(01)-ComA/03",
    });
    expect(res.status).toBe(400);
  });

  it("drops a course and its choices together", async () => {
    const plan = await newPlan("Shrinking draft");
    const action = `/api${plan}`;
    await post(action, { intent: "add-course", course: "COMP2100_S2_(01)" });
    await post(action, { intent: "remove-course", course: "COMP2100_S2_(01)" });
    const { doc } = await page(plan);
    expect(doc.querySelectorAll(".course")).toHaveLength(0);
    expect(doc.querySelectorAll(".session")).toHaveLength(0);
  });

  it("renames, and deletes back to the list", async () => {
    const plan = await newPlan("Old name");
    await post(`/api${plan}`, { intent: "rename", name: "New name" });
    expect((await page(plan)).doc.querySelector("h1")?.textContent).toBe("New name");

    const gone = await post(`/api${plan}`, { intent: "delete" });
    expect(gone.headers.get("location")).toBe("/");
    expect((await page(plan)).status).toBe(404);
  });

  it("answers 404 for a draft that never existed", async () => {
    expect((await page("/plans/999999")).status).toBe(404);
    expect((await post("/api/plans/999999", { intent: "rename", name: "x" })).status).toBe(404);
  });
});

// The invariants only visit spec/routes.ts, and a plan page has nothing to
// visit in the throwaway database — so build a full one and check it here.
describe("invariants: a plan page with courses in it", () => {
  it("has one h1, a nav, a title, and no axe violations", async () => {
    const plan = await newPlan("Checked draft");
    for (const course of ["COMP2100_S2_(01)", "COMP2120_S2_(01)", "COMP1110_S2_(01)"]) {
      await post(`/api${plan}`, { intent: "add-course", course });
    }
    const { status, dom, doc } = await page(plan);
    expect(status).toBe(200);
    expect(doc.documentElement.getAttribute("lang")).toBeTruthy();
    expect(doc.title).toMatch(/Checked draft/);
    expect(doc.querySelector('meta[name="viewport"]')).toBeTruthy();
    expect(doc.querySelector("nav")).toBeTruthy();
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    expect(doc.querySelectorAll(".course").length).toBe(3);

    const window = dom.window as unknown as { eval: (source: string) => void; axe: typeof axe };
    window.eval(axe.source);
    const results = await window.axe.run(doc, {
      rules: { "color-contrast": { enabled: false }, "link-in-text-block": { enabled: false } },
    });
    expect(results.violations.map(({ id, nodes }) => `${id} (${nodes.length})`)).toEqual([]);
  });
});
