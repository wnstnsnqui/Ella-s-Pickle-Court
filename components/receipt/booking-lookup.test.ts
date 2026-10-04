// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LOOKUP_FAILED_MESSAGE } from "@/lib/booking/lookup";

import { BookingLookup } from "./booking-lookup";

/**
 * Spec 0017, AC-13: a lookup that never reaches the server (offline, a
 * dropped connection) rejects in the browser instead of answering `failed`.
 * It must still show the failure card, not throw to the error boundary.
 */

const actions = vi.hoisted(() => ({ lookupBooking: vi.fn() }));
vi.mock("@/lib/booking/actions", () => actions);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function find(code: string) {
  fireEvent.change(screen.getByLabelText("Booking code"), { target: { value: code } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Find booking" }));
  });
}

describe("a lookup the network drops", () => {
  it("shows the failure card with Try again, and Try again asks once more", async () => {
    actions.lookupBooking.mockRejectedValue(new TypeError("Failed to fetch"));
    render(createElement(BookingLookup));

    await find("PXVX4JA8");

    expect(await screen.findByText(LOOKUP_FAILED_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Text us" }).getAttribute("href")).toContain(
      encodeURIComponent("PXVX-4JA8"),
    );
    expect(actions.lookupBooking).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(actions.lookupBooking).toHaveBeenCalledTimes(2);
    expect(actions.lookupBooking).toHaveBeenLastCalledWith({ code: "PXVX4JA8" });
  });
});
