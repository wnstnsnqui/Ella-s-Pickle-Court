import { describe, expect, it } from "vitest";

import { venueJsonLd } from "./venue-json-ld";

/**
 * Spec 0007, AC-21: one entry per distinct pair, days listed Monday first,
 * entries ordered by their earliest listed day, closed days left out.
 */

type Day = { dayOfWeek: number; open: string | null; close: string | null };

const uniform: Day[] = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  open: "06:00",
  close: "22:00",
}));

const specs = (days: Day[]) =>
  venueJsonLd({ days }, "https://example.test").openingHoursSpecification;

describe("venueJsonLd", () => {
  it("emits one entry for a week open the same hours every day", () => {
    expect(specs(uniform)).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        opens: "06:00",
        closes: "22:00",
      },
    ]);
  });

  it("splits the late Friday into its own entry, Monday first within each", () => {
    const lateFriday = uniform.map((day) =>
      day.dayOfWeek === 5 ? { ...day, close: "24:00" } : day,
    );
    const result = specs(lateFriday);
    expect(result).toHaveLength(2);
    expect(result[0].dayOfWeek).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Saturday",
      "Sunday",
    ]);
    expect(result[1]).toMatchObject({ dayOfWeek: ["Friday"], closes: "24:00" });
  });

  it("leaves a closed day out rather than emitting null times", () => {
    const shutMonday = uniform.map((day) =>
      day.dayOfWeek === 1 ? { ...day, open: null, close: null } : day,
    );
    const result = specs(shutMonday);
    expect(result).toHaveLength(1);
    expect(result[0].dayOfWeek).not.toContain("Monday");
    expect(result[0].dayOfWeek).toContain("Tuesday");
  });

  it("groups days that share a pair even when they are not next to each other", () => {
    const days = uniform.map((day) =>
      day.dayOfWeek === 2 || day.dayOfWeek === 6 ? { ...day, open: "07:00" } : day,
    );
    const result = specs(days);
    expect(result).toHaveLength(2);
    expect(result[1].dayOfWeek).toEqual(["Tuesday", "Saturday"]);
  });

  it("emits nothing at all for a week with every day closed", () => {
    expect(specs(uniform.map((day) => ({ ...day, open: null, close: null })))).toEqual([]);
  });
});
