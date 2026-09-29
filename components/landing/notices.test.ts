import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smsHref, VENUE_MESSENGER_URL } from "@/lib/venue";

/**
 * Spec 0013, AC-9, AC-10 and AC-13: the landing page's two toasts. The
 * failure toast is the only failure wording a visitor ever reads; the coming
 * soon toast hands the picks to Messenger or a prefilled text. `sonner` and
 * the browser window are the boundaries here.
 */

const toast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast }));

const { READ_FAILED_MESSAGE, showComingSoonToast, showReadFailedToast } = await import("./notices");

type ToastOptions = {
  description: string;
  action: { label: string; onClick: () => void };
  cancel: { label: string; onClick: () => void };
};

const win = { open: vi.fn(), location: { assign: vi.fn() } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", win);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the read failed toast (AC-9, AC-10)", () => {
  it("says the one fixed sentence, with no code or status", () => {
    showReadFailedToast();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("We couldn't load the live schedule. Message us to book.");
    expect(READ_FAILED_MESSAGE).not.toMatch(/error|\d{3}|digest/i);
  });
});

describe("the coming soon toast (AC-13)", () => {
  const body = "Hi! Can I book Court 1 at 5pm and 6pm, Court 2 at 7pm on Sat 27 Sep?";

  it("says online booking is coming soon and offers Messenger and Text us", () => {
    showComingSoonToast(body);
    const [title, options] = toast.mock.calls[0] as [string, ToastOptions];
    expect(title).toBe("Online booking is coming soon");
    expect(options.description).toBe("Message us and we'll book it for you.");
    expect(options.action.label).toBe("Messenger");
    expect(options.cancel.label).toBe("Text us");
  });

  it("opens the venue's Messenger link in a new tab", () => {
    showComingSoonToast(body);
    const [, options] = toast.mock.calls[0] as [string, ToastOptions];
    options.action.onClick();
    expect(win.open).toHaveBeenCalledWith(VENUE_MESSENGER_URL, "_blank", "noopener,noreferrer");
  });

  it("opens a text whose body names every picked court and hour", () => {
    showComingSoonToast(body);
    const [, options] = toast.mock.calls[0] as [string, ToastOptions];
    options.cancel.onClick();
    expect(win.location.assign).toHaveBeenCalledWith(smsHref(body));
  });

  it("replaces an open coming soon toast rather than stacking a second", () => {
    showComingSoonToast(body);
    showComingSoonToast(body);
    const ids = toast.mock.calls.map(([, options]) => (options as { id: string }).id);
    expect(new Set(ids).size).toBe(1);
  });
});
