import type { APIRoute } from "astro";
import { createPlan } from "../../../lib/db";

// A plain HTML form POSTs here to start a draft. The 303 redirect sends the
// browser to the new plan's page, which renders it from the database — so
// the form works with no client-side JavaScript at all.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim().slice(0, 80) || "Untitled draft";
  const plan = createPlan(name);
  return redirect(`/plans/${plan.id}`, 303);
};
