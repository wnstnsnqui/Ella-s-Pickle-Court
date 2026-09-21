import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Better Auth in the browser. Spec 0004 (revised).
 *
 * Every call goes to `/api/auth/*` on this origin, so no base URL is needed.
 * The forms use `signIn.username` and `signOut`; the account page uses
 * `changePassword`, `updateUser` and the session list. Nothing here creates
 * an account: that is `redeemInvite` on the server (or the bootstrap form's
 * one `signUp.email` call), and the hook in `lib/auth.ts` is the gate either
 * way.
 */
export const authClient = createAuthClient({ plugins: [usernameClient()] });
