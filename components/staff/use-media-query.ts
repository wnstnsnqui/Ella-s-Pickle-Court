"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches right now. Spec 0005, AC-15: the sheets open
 * from the bottom on a phone and from the right from 768 pixels wide.
 *
 * Read through `useSyncExternalStore` so the server render and the first client
 * render agree (the server answer is always false) and the real answer arrives
 * on the client without a hydration mismatch.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** The one breakpoint the sheets care about, matching Tailwind's `md`. */
export const WIDE_QUERY = "(min-width: 768px)";
