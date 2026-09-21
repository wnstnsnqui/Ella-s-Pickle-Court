/**
 * The fixed strings both the server (the hook, the pages) and the client (the
 * forms) show. A plain module with no `server-only`, so a Client Component may
 * import it (see `lib/import-boundaries.test.ts`).
 */

/** The one refusal line every closed door shows. Spec 0004, AC-1. */
export const STAFF_ONLY_LINE =
  "This board is for staff. Ask Ella for an invite link if you need one.";

/** Passwords are 10 to 128 characters (spec 0004, AC-9). */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Usernames are 3 to 30 characters of lower case letters, digits, dots and
 * underscores, with a dot only between two runs of the others (spec 0004,
 * AC-4). Typed in any case, stored lower cased: the same rule Better Auth's
 * username plugin is configured with in `lib/auth.ts`. The dot rule keeps
 * `placeholderEmail()` a well formed address.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;

/**
 * Better Auth requires every user to have an email, and nothing here ever
 * sends one. The column holds this placeholder, derived from the username so
 * it is unique and the gate in `lib/auth/gate.ts` can check a raw request
 * carries nothing else. `.invalid` is reserved (RFC 2606) and never resolves.
 */
export function placeholderEmail(username: string): string {
  return `${username.trim().toLowerCase()}@staff.invalid`;
}

/** Where a signed in person lands when nothing else says otherwise. */
export const STAFF_HOME = "/staff";

/** The signed in person's own page: details, name, password, devices. */
export const ACCOUNT_PAGE = "/staff/account";
