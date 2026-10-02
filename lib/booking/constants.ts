/**
 * The checkout's fixed values, shared by the sheet and the server. A plain
 * module with no `server-only` import, so a Client Component may read it.
 * Spec 0015.
 */

/** The action the Terms step's Turnstile widget is rendered with, and Siteverify must report (AC-3, AC-19). */
export const HOLD_TURNSTILE_ACTION = "booking_hold";

/** How long a hold lasts. The database decides it; the sheet only counts it down (AC-4, AC-8). */
export const HOLD_MINUTES = 5;

/** The screenshot types a player may choose (AC-8). */
export const PROOF_ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** The largest screenshot a player may choose, before it is shrunk (AC-8). */
export const PROOF_MAX_CHOSEN_BYTES = 10 * 1024 * 1024;

/** The long edge the browser shrinks a screenshot to, at most (AC-9). */
export const PROOF_MAX_EDGE = 1600;
