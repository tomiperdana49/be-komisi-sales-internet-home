import type { Context } from "hono";
import type { AdminAccessRow } from "../interface/admin-access.interface";

/**
 * Admin roles come only from the admin_access table (ACL), managed by Super
 * Admins on the "Akses Admin" page:
 * - Super Admin: every branch, and the only role that can change anything
 *   (approve, adjust, Bonus Konsistensi, close periods, targets, rules, ACL).
 * - Admin: read-only, over every branch or just the one in their entry.
 * Anyone without an entry is not an admin.
 */
export function accessFields(access: AdminAccessRow | null) {
  const isSuperAdmin = access?.role === "super_admin";
  return {
    is_admin: access !== null,
    is_super_admin: isSuperAdmin,
    /** Branch their admin views are limited to; null for every branch. */
    admin_branch: access && !isSuperAdmin ? access.branch : null,
  };
}

/** The caller's branch scope on admin routes; null for every branch. Set by adminMiddleware. */
export function adminBranchOf(c: Context): string | null {
  return c.get("adminBranch") ?? null;
}

/** Keeps only the rows in the caller's branch (all rows when their scope is every branch). */
export function inAdminBranch<T>(c: Context, rows: T[], branchOf: (row: T) => string | null | undefined): T[] {
  const branch = adminBranchOf(c);
  return branch === null ? rows : rows.filter((row) => branchOf(row) === branch);
}
