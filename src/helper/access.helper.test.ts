import { describe, expect, test } from "bun:test";
import type { AdminAccessRow } from "../interface/admin-access.interface";
import { accessFields } from "./access.helper";

const MEDAN = "PT. Media Antar Nusa - Medan";
const entry = (role: AdminAccessRow["role"], branch: string | null): AdminAccessRow => ({
  id: 1,
  employee_id: "0200000",
  role,
  branch,
  note: null,
  created_by: "0201507",
  created_at: "2026-10-21",
  updated_by: null,
  updated_at: null,
});

describe("accessFields", () => {
  test("no ACL entry: not an admin", () => {
    expect(accessFields(null)).toEqual({ is_admin: false, is_super_admin: false, admin_branch: null });
  });

  test("Super Admin sees every branch, whatever branch their entry names", () => {
    expect(accessFields(entry("super_admin", MEDAN))).toEqual({ is_admin: true, is_super_admin: true, admin_branch: null });
  });

  test("Admin is limited to their entry's branch, or every branch when it names none", () => {
    expect(accessFields(entry("admin", MEDAN))).toEqual({ is_admin: true, is_super_admin: false, admin_branch: MEDAN });
    expect(accessFields(entry("admin", null))).toEqual({ is_admin: true, is_super_admin: false, admin_branch: null });
  });
});
