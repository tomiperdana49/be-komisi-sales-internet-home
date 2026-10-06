import { Hono } from "hono";
import { container } from "../container";
import { authMiddleware } from "../middleware/auth.middleware";
import { hierarchyMiddleware } from "../middleware/hierarchy.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";

const router = new Hono();

router.post("/auth/login", (c) => container.authController.login(c));
router.post("/auth/dev", (c) => container.authController.devLogin(c));
router.post("/auth/google", (c) => container.authController.google(c));
router.post("/auth/refresh", (c) => container.authController.refresh(c));
router.get("/auth/me", (c) => container.authController.me(c));
router.post("/auth/logout", (c) => container.authController.logout(c));

router.get("/employee/:id", authMiddleware, (c) => container.employeeController.getByEmployeeId(c));
router.get("/employee/:id/hierarchy", authMiddleware, (c) => container.employeeController.getHierarchy(c));

router.get("/sales/:id/commission", authMiddleware, hierarchyMiddleware, (c) =>
  container.commissionController.salesCommission(c),
);
router.get("/sales/:id/commission/year", authMiddleware, hierarchyMiddleware, (c) =>
  container.commissionController.salesCommissionYear(c),
);
router.get("/sales/:id/invoice", authMiddleware, hierarchyMiddleware, (c) =>
  container.commissionController.salesInvoice(c),
);
router.get("/sales/:id/churn", authMiddleware, hierarchyMiddleware, (c) =>
  container.commissionController.salesChurn(c),
);

router.get("/manager/:id/commission", authMiddleware, hierarchyMiddleware, (c) =>
  container.commissionController.managerCommission(c),
);
router.get("/manager/:id/commission/year", authMiddleware, hierarchyMiddleware, (c) =>
  container.commissionController.managerCommissionYear(c),
);

router.get("/feedback", authMiddleware, (c) => container.feedbackController.index(c));
router.post("/feedback", authMiddleware, (c) => container.feedbackController.store(c));

router.get("/summary/sales", authMiddleware, adminMiddleware, (c) => container.summaryController.sales(c));
router.get("/summary/manager", authMiddleware, adminMiddleware, (c) => container.summaryController.manager(c));
router.get("/summary/invoice", authMiddleware, adminMiddleware, (c) => container.summaryController.invoice(c));
router.post("/summary/invoice/:ai/approve", authMiddleware, adminMiddleware, (c) =>
  container.summaryController.approveInvoice(c),
);
router.get("/summary/invoice/:ai", authMiddleware, adminMiddleware, (c) =>
  container.summaryController.invoiceDetail(c),
);
router.put("/summary/invoice/:ai/adjust", authMiddleware, adminMiddleware, (c) =>
  container.summaryController.adjustInvoice(c),
);
router.get("/summary/invoice/:ai/adjustments", authMiddleware, adminMiddleware, (c) =>
  container.summaryController.invoiceAdjustments(c),
);
router.get("/summary/churn", authMiddleware, adminMiddleware, (c) => container.summaryController.churn(c));
router.post("/summary/churn/:id/approve", authMiddleware, adminMiddleware, (c) =>
  container.summaryController.approveChurn(c),
);
router.get("/summary/consistency-bonus", authMiddleware, adminMiddleware, (c) =>
  container.summaryController.consistencyBonus(c),
);
router.put("/summary/consistency-bonus/:id", authMiddleware, adminMiddleware, (c) =>
  container.summaryController.grantConsistencyBonus(c),
);
router.delete("/summary/consistency-bonus/:id", authMiddleware, adminMiddleware, (c) =>
  container.summaryController.revokeConsistencyBonus(c),
);
router.get("/summary/period-closing", authMiddleware, adminMiddleware, (c) =>
  container.summaryController.periodClosings(c),
);
router.put("/summary/period-closing", authMiddleware, adminMiddleware, (c) => container.summaryController.closePeriod(c));
router.delete("/summary/period-closing", authMiddleware, adminMiddleware, (c) =>
  container.summaryController.reopenPeriod(c),
);
router.get("/summary/target-override", authMiddleware, adminMiddleware, (c) =>
  container.targetOverrideController.list(c),
);
router.post("/summary/target-override", authMiddleware, adminMiddleware, (c) =>
  container.targetOverrideController.create(c),
);
router.put("/summary/target-override/:id", authMiddleware, adminMiddleware, (c) =>
  container.targetOverrideController.update(c),
);
router.delete("/summary/target-override/:id", authMiddleware, adminMiddleware, (c) =>
  container.targetOverrideController.remove(c),
);

// Read-only, for every signed-in user: the dashboard's term tooltips quote the period's actual rates.
router.get("/commission-rules/effective", authMiddleware, (c) => container.commissionRuleController.effective(c));
router.get("/summary/rules", authMiddleware, adminMiddleware, (c) => container.commissionRuleController.list(c));
router.get("/summary/rules/effective", authMiddleware, adminMiddleware, (c) =>
  container.commissionRuleController.effective(c),
);
router.get("/summary/rules/:id", authMiddleware, adminMiddleware, (c) => container.commissionRuleController.show(c));
router.post("/summary/rules", authMiddleware, adminMiddleware, (c) => container.commissionRuleController.create(c));
router.put("/summary/rules/:id", authMiddleware, adminMiddleware, (c) => container.commissionRuleController.update(c));
router.get("/summary/rules/:id/preview", authMiddleware, adminMiddleware, (c) =>
  container.commissionRuleController.preview(c),
);
router.post("/summary/rules/:id/publish", authMiddleware, adminMiddleware, (c) =>
  container.commissionRuleController.publish(c),
);
router.delete("/summary/rules/:id", authMiddleware, adminMiddleware, (c) =>
  container.commissionRuleController.remove(c),
);

export default router;
