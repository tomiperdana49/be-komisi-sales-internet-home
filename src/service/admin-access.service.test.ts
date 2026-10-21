import { describe, expect, test } from "bun:test";
import type { AdminAccessInput, AdminAccessRow, IAdminAccessRepository } from "../interface/admin-access.interface";
import { AdminAccessService } from "./admin-access.service";

function setup(rows: Pick<AdminAccessRow, "id" | "employee_id" | "role">[], employeeIds: string[] = [], nusaworkIds: string[] = []) {
  const table: AdminAccessRow[] = rows.map((r) => ({ branch: null, note: null, created_by: "system", created_at: "", updated_by: null, updated_at: null, ...r }));
  const upserted: string[] = [];
  const repository: IAdminAccessRepository = {
    findAll: async () => table,
    findById: async (id) => table.find((r) => r.id === id) ?? null,
    findByEmployeeId: async (id) => table.find((r) => r.employee_id === id) ?? null,
    countSuperAdmins: async () => table.filter((r) => r.role === "super_admin").length,
    create: async (employeeId, input) => void table.push({ ...table[0]!, id: table.length + 1, employee_id: employeeId, ...input }),
    update: async (id, input) => void Object.assign(table.find((r) => r.id === id)!, input),
    remove: async (id) => void table.splice(table.findIndex((r) => r.id === id), 1),
  };
  const employeeService = {
    findByEmployeeId: async (id: string) => (employeeIds.includes(id) ? { employee_id: id, is_active: true } : null),
    upsertEmployee: async (e: { employeeId: string }) => void upserted.push(e.employeeId),
  };
  const nusaworkService = {
    getEmployeesByIds: async (ids: string[]) => ids.filter((id) => nusaworkIds.includes(id)).map((employeeId) => ({ employeeId })),
  };
  const service = new AdminAccessService(repository, employeeService as any, nusaworkService as any);
  return { service, table, upserted };
}

const admin: AdminAccessInput = { role: "admin", branch: null, note: null };
const superAdmin: AdminAccessInput = { role: "super_admin", branch: null, note: null };

describe("AdminAccessService", () => {
  test("a Super Admin can't remove or demote themselves", async () => {
    const { service } = setup([{ id: 1, employee_id: "S1", role: "super_admin" }, { id: 2, employee_id: "S2", role: "super_admin" }]);
    await expect(service.remove(1, "S1")).rejects.toThrow("sendiri");
    await expect(service.update(1, admin, "S1")).rejects.toThrow("sendiri");
  });

  test("the last Super Admin can't be removed or demoted", async () => {
    const { service } = setup([{ id: 1, employee_id: "S1", role: "super_admin" }, { id: 2, employee_id: "A1", role: "admin" }]);
    // Simulate a second caller acting on S1 (e.g. after their own access was changed).
    await expect(service.remove(1, "X")).rejects.toThrow("minimal satu Super Admin");
    await expect(service.update(1, admin, "X")).rejects.toThrow("minimal satu Super Admin");
  });

  test("another Super Admin or any Admin can be removed or changed", async () => {
    const { service, table } = setup([{ id: 1, employee_id: "S1", role: "super_admin" }, { id: 2, employee_id: "S2", role: "super_admin" }, { id: 3, employee_id: "A1", role: "admin" }]);
    await service.update(2, admin, "S1");
    await service.update(3, superAdmin, "S1");
    await service.remove(2, "S1");
    expect(table.map((r) => [r.employee_id, r.role])).toEqual([["S1", "super_admin"], ["A1", "super_admin"]]);
  });

  test("granting someone not in the employee table copies them from Nusawork first", async () => {
    const { service, table, upserted } = setup([{ id: 1, employee_id: "S1", role: "super_admin" }], [], ["N1"]);
    await service.create("N1", admin, "S1");
    expect(upserted).toEqual(["N1"]);
    expect(table.some((r) => r.employee_id === "N1")).toBe(true);
    await expect(service.create("N1", admin, "S1")).rejects.toThrow("sudah punya akses");
    await expect(service.create("NOPE", admin, "S1")).rejects.toThrow("tidak ditemukan di Nusawork");
  });
});
