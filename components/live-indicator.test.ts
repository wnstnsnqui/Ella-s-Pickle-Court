import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { formatAge, LiveIndicator } from "./live-indicator";

/**
 * Spec 0003 and spec 0006, AC-6: the indicator is a polite status that reads
 * Live while the channel is joined and Reconnecting for the first moments it
 * is not. The stale reading after three seconds needs a running timer, which
 * a server render does not have.
 */
const render = (channelStatus: "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR") =>
  renderToStaticMarkup(createElement(LiveIndicator, { channelStatus, lastUpdatedAt: 0 }));

describe("LiveIndicator", () => {
  it("is a polite live region", () => {
    const html = render("SUBSCRIBED");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("reads Live while the channel is joined", () => {
    const html = render("SUBSCRIBED");
    expect(html).toContain('data-reading="live"');
    expect(html).toContain("Live");
  });

  it("reads Reconnecting at first for every other channel state", () => {
    for (const status of ["TIMED_OUT", "CLOSED", "CHANNEL_ERROR"] as const) {
      const html = render(status);
      expect(html).toContain('data-reading="reconnecting"');
      expect(html).toContain("Reconnecting");
    }
  });
});

describe("formatAge", () => {
  it("counts seconds under a minute", () => {
    expect(formatAge(0)).toBe("0s");
    expect(formatAge(59_400)).toBe("59s");
  });

  it("counts minutes under an hour, and hours after", () => {
    expect(formatAge(90_000)).toBe("2m");
    expect(formatAge(59 * 60_000)).toBe("59m");
    expect(formatAge(2 * 3_600_000)).toBe("2h");
  });

  it("never shows a negative age from a clock that stepped back", () => {
    expect(formatAge(-5_000)).toBe("0s");
  });
});
