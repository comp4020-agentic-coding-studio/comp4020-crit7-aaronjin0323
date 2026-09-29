import type { APIRoute } from "astro";
import { addCourse, deletePlan, getPlan, pickClass, removeCourse, renamePlan } from "../../../lib/db";
import { announce } from "../../../lib/events";
import { anchor } from "../../../lib/timetable";

// Every change to a plan is a plain form POST here, named by its `intent`,
// answered with a 303 back to the plan page — so each one works without
// JavaScript. The fragment puts the browser back where the change was made
// rather than at the top of a long page.
export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || !getPlan(id)) {
    return new Response("No such plan", { status: 404 });
  }
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const back = (fragment = "") => redirect(`/plans/${id}${fragment && `#${fragment}`}`, 303);

  let fragment = "";
  let ok = true;
  switch (field("intent")) {
    case "rename": {
      const name = field("name").slice(0, 80);
      if (name) renamePlan(id, name);
      break;
    }
    case "delete":
      deletePlan(id);
      announce({ planId: id, updatedAt: null });
      return redirect("/", 303);
    case "add-course":
      ok = addCourse(id, field("course"));
      fragment = ok ? anchor(field("course")) : "";
      break;
    case "remove-course":
      removeCourse(id, field("course"));
      fragment = "courses";
      break;
    case "pick":
      ok = pickClass(id, field("activity"), field("class"));
      fragment = anchor(field("activity"));
      break;
    default:
      ok = false;
  }
  if (!ok) return new Response("That change doesn't fit this plan", { status: 400 });

  announce({ planId: id, updatedAt: getPlan(id)?.updatedAt ?? null });
  return back(fragment);
};
