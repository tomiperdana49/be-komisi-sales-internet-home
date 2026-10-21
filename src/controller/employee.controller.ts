import type { Context } from "hono";
import { NotFoundException } from "../exception/http.exception";
import { successResponse } from "../helper/api-response.helper";
import type { IEmployeeService } from "../interface/employee.interface";

export class EmployeeController {
  constructor(private readonly employeeService: IEmployeeService) {}

  async getByEmployeeId(c: Context) {
    const employeeId = c.req.param("id")!;
    const employee = await this.employeeService.findByEmployeeId(employeeId);
    if (!employee) {
      throw new NotFoundException("Employee not found");
    }
    return c.json(successResponse("Employee retrieved successfully", employee));
  }

  async getHierarchy(c: Context) {
    const employeeId = c.req.param("id")!;
    const search = c.req.query("q");
    const hierarchy = await this.employeeService.getVisibleTeam(employeeId, search);
    return c.json(successResponse("Employee hierarchy retrieved successfully", hierarchy));
  }
}
