import type { StaffRole } from "@/lib/schedule/constants";

/**
 * The pure logic behind `/staff/admin/users`'s row editing, shared by
 * `UsersPanel` and `UserSheet` without either importing the other. Spec
 * 0012, AC-3.
 */

/** The `superadmin` option in a row's role picker, disabled once two rows already hold it (AC-3). */
export function superadminOptionDisabled(rowRole: StaffRole, superadminCount: number): boolean {
  return rowRole !== "superadmin" && superadminCount >= 2;
}

export function roleLabel(role: StaffRole): string {
  return role === "staff"
    ? "Staff"
    : role === "owner"
      ? "Owner"
      : role === "admin"
        ? "Admin"
        : "Superadmin";
}
