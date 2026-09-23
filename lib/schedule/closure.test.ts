import { describe, expect, it } from "vitest";

import { closureEndOptions } from "./closure";
import { buildGrid } from "./grid";
import type { StaffReservation } from "./queries";

/** Spec 0005, AC-8: a closure's end may move along the free run after its start. */

const SETTINGS = {
  days: [
    { dayOfWeek: 0, open: "08:00", close: "13:00" },
    { dayOfWeek: 1, open: "08:00", close: "13:00" },
    { dayOfWeek: 2, open: "08:00", close: "13:00" },
    { dayOfWeek: 3, open: "08:00", close: "13:00" },
    { dayOfWeek: 4, open: "08:00", close: "13:00" },
    { dayOfWeek: 5, open: "08:00", close: "13:00" },
    { dayOfWeek: 6, open: "08:00", close: "13:00" },
  ],
  slotMinutes: 60,
  bookingHorizonDays: 14,
  timezone: "Asia/Manila",
  version: 1,
};

const at = (hourUtc: number) => `2026-09-16T${String(hourUtc).padStart(2, "0")}:00:00.000Z`;

function reservation(partial: Partial<StaffReservation> & Pick<StaffReservation, "id">) {
  return {
    courtId: 1,
    kind: "closed",
    status: "active",
    startsAt: at(1),
    endsAt: at(2),
    customerName: null,
    customerPhone: null,
    note: null,
    paymentStatus: "unpaid",
    amount: null,
    version: 1,
    createdBy: null,
    changedBy: null,
    createdAt: at(0),
    updatedAt: at(0),
    ...partial,
  } satisfies StaffReservation;
}

describe("closureEndOptions", () => {
  it("offers every slot end after the start up to closing time when nothing is in the way", () => {
    // 9am to 10am local closure on a day open 8am to 1pm.
    const closure = reservation({ id: 1 });
    const grid = buildGrid({
      date: "2026-09-16",
      settings: SETTINGS,
      courts: [{ id: 1, name: "Court 1", note: null, sortOrder: 1 }],
      blocks: [{ courtId: 1, startsAt: closure.startsAt, endsAt: closure.endsAt, kind: "closed" }],
    });
    expect(closureEndOptions(grid, [closure], closure).map((option) => option.time)).toEqual([
      "10:00",
      "11:00",
      "12:00",
      "13:00",
    ]);
  });

  it("stops at the first slot somebody else holds on that court", () => {
    const closure = reservation({ id: 1 });
    const booking = reservation({ id: 2, kind: "booking", startsAt: at(3), endsAt: at(4) });
    const grid = buildGrid({
      date: "2026-09-16",
      settings: SETTINGS,
      courts: [{ id: 1, name: "Court 1", note: null, sortOrder: 1 }],
      blocks: [closure, booking].map((row) => ({
        courtId: row.courtId,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        kind: row.kind,
      })),
    });
    expect(closureEndOptions(grid, [closure, booking], closure).map((o) => o.time)).toEqual([
      "10:00",
      "11:00",
    ]);
  });
});
