// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement, createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BookingReceipt, HeldBooking, HoldResult, SubmitResult } from "@/lib/booking/types";

import { CheckoutSheet, type CheckoutOrder } from "./checkout-sheet";
import { manila } from "./test-fixture";

/**
 * Spec 0015, the checkout card (AC-2 to AC-15, AC-27): what the player can do
 * at each step, and what the card sends and shows. The Server Actions, the
 * Turnstile widget and the screenshot upload are the boundaries, so they are
 * faked; everything the player sees is the real card.
 */

const actions = vi.hoisted(() => ({
  holdOnlineBooking: vi.fn(),
  submitOnlineBooking: vi.fn(),
  releaseOnlineBooking: vi.fn(),
}));
vi.mock("@/lib/booking/actions", () => actions);

const analytics = vi.hoisted(() => ({ captureBrowserException: vi.fn() }));
vi.mock("@/lib/analytics/browser", () => analytics);

vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
}));

vi.mock("@/lib/booking/proof", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/booking/proof")>()),
  shrinkProof: vi.fn(async () => new Blob(["webp"], { type: "image/webp" })),
  uploadProof: vi.fn(async () => undefined),
}));

vi.mock("next/image", () => ({
  default: (props: { src: string; alt: string }) =>
    createElement("img", { src: props.src, alt: props.alt }),
}));

// The widget is the bot check's boundary: a test hands the card a token or a failure.
type WidgetProps = {
  attempt: number;
  onToken: (token: string | null) => void;
  onFail: () => void;
};
let widget: WidgetProps | null = null;
vi.mock("./turnstile-widget", () => ({
  TurnstileWidget: (props: WidgetProps) => {
    widget = props;
    return null;
  },
}));

const DAY = "2026-10-30";
const NINE_PM = manila(DAY, "21:00");

const order: CheckoutOrder = {
  date: DAY,
  heading: "Fri 30 Oct",
  groups: [{ court: { id: 1, name: "Court 1", note: null, sortOrder: 1 }, labels: ["9pm"] }],
  total: 250,
  picks: [{ courtId: 1, startsAt: NINE_PM }],
  slotMinutes: 60,
};

function held(): HeldBooking {
  const now = Date.now();
  return {
    code: "K7MQ3XPT",
    holdExpiresAt: new Date(now + 5 * 60_000).toISOString(),
    serverNow: new Date(now).toISOString(),
    amount: 250,
    runs: [{ courtId: 1, startsAt: NINE_PM, endsAt: manila(DAY, "22:00"), amount: 250 }],
    upload: { signedUrl: "https://storage.example/upload" },
  };
}

const receipt: BookingReceipt = {
  code: "K7MQ3XPT",
  status: "pending_check",
  amount: 250,
  runs: [{ courtId: 1, startsAt: NINE_PM, endsAt: manila(DAY, "22:00"), amount: 250 }],
  customer: { name: "Ana Reyes", phone: "+639171234567", email: "ana@example.com" },
  payment: { referenceLast4: "1234", submittedAt: manila(DAY, "17:05") },
  retaken: false,
};

function renderCard() {
  const onClose = vi.fn();
  const onRefused = vi.fn();
  const returnFocusTo = createRef<HTMLElement>();
  render(
    createElement(CheckoutSheet, {
      open: true,
      onClose,
      order,
      returnFocusTo,
      onRefused,
      describeTaken: () => "Court 1 at 9pm was just booked.",
    }),
  );
  return { onClose, onRefused };
}

const heading = (name: string) => screen.findByRole("heading", { name });
const button = (name: string | RegExp) => screen.getByRole("button", { name });

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function fillDetails() {
  type("Name", "Ana Reyes");
  type("Mobile number", "0917 123 4567");
  type("Email", "ana@example.com");
  fireEvent.click(button("Next"));
  await heading("Booking rules");
}

function tickAll() {
  for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
}

function giveToken(token = "token-1") {
  act(() => widget?.onToken(token));
}

async function toPayment() {
  await fillDetails();
  tickAll();
  giveToken();
  fireEvent.click(button("Next: Pay"));
  await heading("Pay by GCash");
}

async function uploadScreenshot() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input");
  const file = new File(["png"], "proof.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText("Screenshot uploaded");
}

beforeEach(() => {
  widget = null;
  actions.holdOnlineBooking.mockResolvedValue({ ok: true, data: held() } satisfies HoldResult);
  actions.submitOnlineBooking.mockResolvedValue({ ok: true, data: receipt } satisfies SubmitResult);
  actions.releaseOnlineBooking.mockResolvedValue({ released: true });
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Details step", () => {
  it("marks every blank field with its own message and moves focus to Name (AC-2)", async () => {
    renderCard();

    fireEvent.click(button("Next"));

    expect(await screen.findByText("Enter your name.")).toBeTruthy();
    expect(screen.getByText("Enter your mobile number.")).toBeTruthy();
    expect(screen.getByText("Enter your email.")).toBeTruthy();
    const name = screen.getByLabelText("Name");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(name);
  });

  it("ties each message to its field for screen readers (AC-2)", async () => {
    renderCard();

    fireEvent.click(button("Next"));
    await screen.findByText("Enter your name.");

    const name = screen.getByLabelText("Name");
    const ids = name.getAttribute("aria-describedby")?.split(" ") ?? [];
    const described = ids.map((id) => document.getElementById(id)?.textContent).join(" ");
    expect(described).toContain("Enter your name.");
  });

  it("refuses a phone that is not a Philippine mobile (AC-2)", async () => {
    renderCard();
    type("Name", "Ana Reyes");
    type("Mobile number", "12345");
    type("Email", "ana@example.com");

    fireEvent.click(button("Next"));

    expect(
      await screen.findByText("Use a Philippine mobile number, like 0917 123 4567."),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Booking rules" })).toBeNull();
  });

  it("moves to Terms with focus on its heading once the details are valid (AC-2, AC-25)", async () => {
    renderCard();

    await fillDetails();

    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Booking rules" }));
  });

  it("keeps every typed value when the player comes Back from Terms (AC-2)", async () => {
    renderCard();
    await fillDetails();

    fireEvent.click(button("Back"));
    await heading("Your details");

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Ana Reyes");
    expect((screen.getByLabelText("Mobile number") as HTMLInputElement).value).toBe(
      "0917 123 4567",
    );
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("ana@example.com");
  });

  it("just closes on Cancel before any hold, releasing nothing (AC-27)", () => {
    const { onClose } = renderCard();

    fireEvent.click(button("Cancel"));

    expect(onClose).toHaveBeenCalledWith("left");
    expect(actions.releaseOnlineBooking).not.toHaveBeenCalled();
  });
});

describe("Terms step", () => {
  it("keeps Next: Pay off until all three boxes are ticked and a token has arrived (AC-3)", async () => {
    renderCard();
    await fillDetails();
    const [rules, terms, privacy] = screen.getAllByRole("checkbox");

    giveToken();
    fireEvent.click(rules);
    fireEvent.click(terms);
    expect(button("Next: Pay").hasAttribute("disabled")).toBe(true);

    fireEvent.click(privacy);
    expect(button("Next: Pay").hasAttribute("disabled")).toBe(false);
  });

  it("keeps Next: Pay off with every box ticked while Turnstile has issued no token (AC-3)", async () => {
    renderCard();
    await fillDetails();

    tickAll();

    expect(button("Next: Pay").hasAttribute("disabled")).toBe(true);
  });

  it("names each box by its whole label, with Terms and Privacy opening in a new tab (AC-3)", async () => {
    renderCard();
    await fillDetails();

    expect(screen.getByRole("checkbox", { name: /booking rules above/ })).toBeTruthy();
    const terms = screen.getByRole("link", { name: /Terms/ });
    const privacy = screen.getByRole("link", { name: /Privacy notice/ });
    expect([terms.getAttribute("href"), terms.getAttribute("target")]).toEqual([
      "/terms",
      "_blank",
    ]);
    expect([privacy.getAttribute("href"), privacy.getAttribute("target")]).toEqual([
      "/privacy",
      "_blank",
    ]);
  });

  it("keeps the ticks when the player goes Back and comes forward again (AC-3)", async () => {
    renderCard();
    await fillDetails();
    tickAll();

    fireEvent.click(button("Back"));
    await heading("Your details");
    fireEvent.click(button("Next"));
    await heading("Booking rules");

    const states = screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-checked"));
    expect(states).toEqual(["true", "true", "true"]);
  });
});

describe("the hold", () => {
  it("sends the details, all three consents, the picks and the token, and never a price (AC-3, AC-4, AC-17)", async () => {
    renderCard();

    await toPayment();

    expect(actions.holdOnlineBooking).toHaveBeenCalledTimes(1);
    const input = actions.holdOnlineBooking.mock.calls[0][0];
    expect(input).toEqual({
      submissionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      date: DAY,
      picks: [{ courtId: 1, startsAt: NINE_PM }],
      name: "Ana Reyes",
      phone: "+639171234567",
      email: "ana@example.com",
      consent: { rules: true, terms: true, privacy: true },
      turnstileToken: "token-1",
    });
  });

  it("asks the widget for a fresh token after the hold, because a token is single use (AC-19)", async () => {
    renderCard();
    await fillDetails();
    tickAll();
    giveToken();
    const before = widget?.attempt ?? 0;

    fireEvent.click(button("Next: Pay"));
    await heading("Pay by GCash");

    fireEvent.click(button("Back"));
    await heading("Booking rules");
    expect(widget?.attempt).toBe(before + 1);
    expect(button("Next: Pay").hasAttribute("disabled")).toBe(true);
  });

  it("holds again with the same submission id after the player edits their details (AC-5)", async () => {
    renderCard();
    await toPayment();

    fireEvent.click(button("Back"));
    await heading("Booking rules");
    fireEvent.click(button("Back"));
    await heading("Your details");
    type("Name", "Ana R. Reyes");
    fireEvent.click(button("Next"));
    await heading("Booking rules");
    giveToken("token-2");
    fireEvent.click(button("Next: Pay"));
    await heading("Pay by GCash");

    const [first, second] = actions.holdOnlineBooking.mock.calls.map((call) => call[0]);
    expect(second.submissionId).toBe(first.submissionId);
    expect(second.name).toBe("Ana R. Reyes");
    expect(second.turnstileToken).toBe("token-2");
  });

  it("hands a taken slot back to the picker (AC-6)", async () => {
    const refusal = {
      kind: "slot_taken" as const,
      message: "taken",
      slots: [{ courtId: 1, startsAt: NINE_PM }],
    };
    actions.holdOnlineBooking.mockResolvedValue({ ok: false, error: refusal });
    const { onRefused } = renderCard();
    await fillDetails();
    tickAll();
    giveToken();

    fireEvent.click(button("Next: Pay"));

    await vi.waitFor(() => expect(onRefused).toHaveBeenCalledWith(refusal));
  });

  it("stays on Terms with the wait and both channels when the connection is rate limited (AC-7, AC-19)", async () => {
    actions.holdOnlineBooking.mockResolvedValue({
      ok: false,
      error: { kind: "rate_limited", message: "", retryAfterSeconds: 90 },
    });
    renderCard();
    await fillDetails();
    tickAll();
    giveToken();

    fireEvent.click(button("Next: Pay"));

    const alert = await screen.findByText(/Too many tries from this connection/);
    expect(alert.textContent).toContain("Try again in 2 minutes, or message us.");
    expect(screen.getByRole("heading", { name: "Booking rules" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Messenger/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Text us/ })).toBeTruthy();
  });

  it("retries the bot check once quietly, then says it can't continue and offers both channels (AC-7)", async () => {
    renderCard();
    await fillDetails();
    const start = widget?.attempt ?? 0;

    act(() => widget?.onFail());
    expect(widget?.attempt).toBe(start + 1);
    expect(screen.queryByText(/can't continue on this device/)).toBeNull();

    act(() => widget?.onFail());

    expect(await screen.findByText(/can't continue on this device/)).toBeTruthy();
    const text = screen.getByRole("link", { name: /Text us/ });
    expect(decodeURIComponent(text.getAttribute("href") ?? "")).toContain("Court 1 at 9pm");
    tickAll();
    expect(button("Next: Pay").hasAttribute("disabled")).toBe(true);
  });

  it("treats a bot_check answer from the server as a failed widget, retrying quietly first (AC-7)", async () => {
    actions.holdOnlineBooking.mockResolvedValue({
      ok: false,
      error: { kind: "bot_check", message: "" },
    });
    renderCard();
    await fillDetails();
    tickAll();
    giveToken();

    fireEvent.click(button("Next: Pay"));
    await vi.waitFor(() => expect(actions.holdOnlineBooking).toHaveBeenCalled());

    expect(screen.queryByText(/can't continue on this device/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Booking rules" })).toBeTruthy();
  });

  it("says it couldn't hold, and reports the error, when the request itself fails", async () => {
    actions.holdOnlineBooking.mockRejectedValue(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderCard();
    await fillDetails();
    tickAll();
    giveToken();

    fireEvent.click(button("Next: Pay"));

    expect(await screen.findByText(/We couldn't hold your slots just now/)).toBeTruthy();
    expect(analytics.captureBrowserException).toHaveBeenCalledTimes(1);
  });
});

describe("Payment step", () => {
  it("shows the amount from the hold and the hold banner, but not the code yet (AC-8)", async () => {
    renderCard();

    await toPayment();

    expect(screen.queryByText("K7MQ-3XPT")).toBeNull();
    expect(screen.getByText(/Send exactly ₱250/)).toBeTruthy();
    expect(screen.getByText("Your slots are held for you")).toBeTruthy();
  });

  it("keeps only digits, and keeps Next off until 4 digits are in and the screenshot has uploaded (AC-8)", async () => {
    renderCard();
    await toPayment();
    const digits = screen.getByLabelText("Last 4 digits of the reference number");

    fireEvent.change(digits, { target: { value: "98a76" } });
    expect((digits as HTMLInputElement).value).toBe("9876");
    expect(button("Next").hasAttribute("disabled")).toBe(true);

    await uploadScreenshot();
    expect(button("Next").hasAttribute("disabled")).toBe(false);
  });

  it("refuses a file of the wrong type on the field before any upload (AC-9)", async () => {
    const { uploadProof } = await import("@/lib/booking/proof");
    renderCard();
    await toPayment();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');

    fireEvent.change(input!, {
      target: { files: [new File(["gif"], "proof.gif", { type: "image/gif" })] },
    });

    expect(await screen.findByText(/Choose a PNG, JPEG or WebP image/)).toBeTruthy();
    expect(uploadProof).not.toHaveBeenCalled();
  });
});

describe("Review, Confirm and the receipt", () => {
  async function toReview() {
    await toPayment();
    fireEvent.change(screen.getByLabelText("Last 4 digits of the reference number"), {
      target: { value: "1234" },
    });
    await uploadScreenshot();
    fireEvent.click(button("Next"));
    await heading("Check and confirm");
  }

  it("confirms with the submission id and the digits, never a path, and shows the receipt (AC-12, AC-14)", async () => {
    renderCard();
    await toReview();
    const { submissionId } = actions.holdOnlineBooking.mock.calls[0][0];

    fireEvent.click(button("Confirm booking"));
    await heading("Booking confirmed");

    expect(actions.submitOnlineBooking).toHaveBeenCalledWith({
      submissionId,
      referenceLast4: "1234",
    });
    expect(screen.getByText("Confirmed")).toBeTruthy();
    expect(screen.queryByText("Your slots are held for you")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
  });

  it("sends Confirm once however fast it is pressed twice (AC-12)", async () => {
    let finish: (value: SubmitResult) => void = () => undefined;
    actions.submitOnlineBooking.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderCard();
    await toReview();

    fireEvent.click(button("Confirm booking"));
    fireEvent.click(button(/Confirm/));
    await act(async () => finish({ ok: true, data: receipt }));

    expect(actions.submitOnlineBooking).toHaveBeenCalledTimes(1);
  });

  it("jumps back to Details from Edit, with every value still there (AC-11)", async () => {
    renderCard();
    await toReview();

    fireEvent.click(button(/Edit your details/));
    await heading("Your details");

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Ana Reyes");
  });

  it("shows the refund message with the code, and no banner or back arrow, when a slot went after the hold ended (AC-13)", async () => {
    actions.submitOnlineBooking.mockResolvedValue({
      ok: false,
      error: { kind: "slot_taken", message: "", slots: [{ courtId: 1, startsAt: NINE_PM }] },
    });
    renderCard();
    await toReview();

    fireEvent.click(button("Confirm booking"));

    const message = await screen.findByText(/You've already paid/);
    expect(message.textContent).toContain("Court 1 at 9pm was just booked.");
    expect(message.textContent).toContain("K7MQ-3XPT");
    expect(screen.queryByText("Your slots are held for you")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
    const text = screen.getByRole("link", { name: /Text us/ });
    expect(decodeURIComponent(text.getAttribute("href") ?? "")).toContain("1234");
  });

  it("releases nothing when closed from the receipt, and tells the picker it booked (AC-14)", async () => {
    const { onClose } = renderCard();
    await toReview();
    fireEvent.click(button("Confirm booking"));
    await heading("Booking confirmed");

    fireEvent.click(button("Done"));

    expect(onClose).toHaveBeenCalledWith("booked");
    expect(actions.releaseOnlineBooking).not.toHaveBeenCalled();
  });
});

describe("closing during a hold", () => {
  it("releases the hold at once when closed from Payment with nothing typed (AC-15)", async () => {
    const { onClose } = renderCard();
    await toPayment();
    const { submissionId } = actions.holdOnlineBooking.mock.calls[0][0];

    fireEvent.click(button("Close"));

    expect(actions.releaseOnlineBooking).toHaveBeenCalledWith({ submissionId });
    expect(onClose).toHaveBeenCalledWith("left");
  });

  it("asks before leaving once digits are typed, and Stay keeps the card as it was (AC-15)", async () => {
    const { onClose } = renderCard();
    await toPayment();
    fireEvent.change(screen.getByLabelText("Last 4 digits of the reference number"), {
      target: { value: "12" },
    });

    fireEvent.click(button("Close"));
    const dialog = await screen.findByRole("dialog", { name: "Leave checkout?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Stay" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(actions.releaseOnlineBooking).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText("Last 4 digits of the reference number") as HTMLInputElement).value,
    ).toBe("12");
  });

  it("releases the hold when the player chooses Leave (AC-15)", async () => {
    const { onClose } = renderCard();
    await toPayment();
    fireEvent.change(screen.getByLabelText("Last 4 digits of the reference number"), {
      target: { value: "12" },
    });
    fireEvent.click(button("Close"));
    const dialog = await screen.findByRole("dialog", { name: "Leave checkout?" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Leave" }));

    expect(actions.releaseOnlineBooking).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("left");
  });

  it("releases the hold on Cancel after the player went Back to Details (AC-15, AC-27)", async () => {
    const { onClose } = renderCard();
    await toPayment();
    fireEvent.click(button("Back"));
    await heading("Booking rules");
    fireEvent.click(button("Back"));
    await heading("Your details");

    fireEvent.click(button("Cancel"));

    expect(actions.releaseOnlineBooking).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("left");
  });
});
