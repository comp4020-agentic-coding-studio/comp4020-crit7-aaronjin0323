import { EventEmitter } from "node:events";

// One process, one bus: every open SSE connection subscribes here, and a
// changed plan is broadcast to all of them, so a plan open in a second tab
// catches up. This only works because the app runs on exactly one machine
// (see fly.toml) — a second machine would have its own bus and clients
// would miss events.
export const bus = new EventEmitter();
bus.setMaxListeners(0);

export interface PlanChanged {
  planId: number;
  /** The plan's updatedAt after the change; a page that already shows this
   *  version (the tab that made the change) has nothing to catch up on. */
  updatedAt: string | null;
}

export const announce = (event: PlanChanged) => bus.emit("plan", event);
