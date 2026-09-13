import { z } from "zod";

/**
 * The reader's theme choice.
 *
 * `system` is the default and means what spec 0003 always meant: follow the
 * device. `light` and `dark` pin one. The choice lives in a cookie rather than
 * in localStorage on purpose: the server reads it and stamps `data-theme` on
 * `<html>` before the first byte leaves, so there is never a paint in the wrong
 * theme and never a blocking script to prevent one.
 */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "theme";

/** Anything that is not one of the three reads as `system`. */
export const themeSchema = z.enum(THEMES).catch("system");

export function parseTheme(value: string | undefined | null): Theme {
  return themeSchema.parse(value ?? undefined);
}

/** A year, in seconds. Long enough that nobody has to pick twice. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
