import { Hono } from "hono";
import { container } from "../container";
import { authMiddleware } from "../middleware/auth.middleware";
import { hierarchyMiddleware } from "../middleware/hierarchy.middleware";
import { adminMiddleware, superAdminMiddleware } from "../middleware/admin.middleware";

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

// Customer testimonials an Account Manager collected; anyone who can see them may add one.
router.get("/sales/:id/testimonial", authMiddleware, hierarchyMiddleware, (c) =>
  container.testimonialController.listBySales(c),
);
router.post("/sales/:id/testimonial", authMiddleware, hierarchyMiddleware, (c) =>
  container.testimonialController.create(c),
);
router.put("/sales/:id/testimonial/:testimonialId", authMiddleware, hierarchyMiddleware, (c) =>
  container.testimonialController.update(c),
);
router.delete("/sales/:id/testimonial/:testimonialId", authMiddleware, hierarchyMiddleware, (c) =>
  container.testimonialController.remove(c),
);

router.get("/manager/:id/commission", authMiddleware, hierarchyMiddleware, (c) =>
  container.commissionController.managerCommission(c),
);
router.get("/manager/:id/commission/year", authMiddleware, hierarchyMiddleware, (c) =>
  container.commissionController.managerCommissionYear(c),
);
router.get("/manager/:id/churn", authMiddleware, hierarchyMiddleware, (c) =>
  container.commissionController.managerChurn(c),
);

router.get("/feedback", authMiddleware, (c) => container.feedbackController.index(c));
router.post("/feedback", authMiddleware, (c) => container.feedbackController.store(c));

// Admin pages. Any admin can view them, a branch Admin only their own branch
// (summary controllers filter by it); every change is Super Admin only.
router.get("/summary/sales", authMiddleware, adminMiddleware, (c) => container.summaryController.sales(c));
router.get("/summary/manager", authMiddleware, adminMiddleware, (c) => container.summaryController.manager(c));
router.get("/summary/invoice", authMiddleware, adminMiddleware, (c) => container.summaryController.invoice(c));
router.post("/summary/invoice/:ai/approve", authMiddleware, superAdminMiddleware, (c) =>
  container.summaryController.approveInvoice(c),
);
router.get("/summary/invoice/:ai", authMiddleware, superAdminMiddleware, (c) =>
  container.summaryController.invoiceDetail(c),
);
router.put("/summary/invoice/:ai/adjust", authMiddleware, superAdminMiddleware, (c) =>
  container.summaryController.adjustInvoice(c),
);
router.get("/summary/invoice/:ai/adjustments", authMiddleware, superAdminMiddleware, (c) =>
  container.summaryController.invoiceAdjustments(c),
);
router.get("/summary/churn", authMiddleware, adminMiddleware, (c) => container.summaryController.churn(c));
router.get("/summary/stopped-services", authMiddleware, adminMiddleware, (c) =>
  container.summaryController.stoppedServices(c),
);
router.post("/summary/churn/:id/approve", authMiddleware, superAdminMiddleware, (c) =>
  container.summaryController.approveChurn(c),
);
router.get("/summary/consistency-bonus", authMiddleware, adminMiddleware, (c) =>
  container.summaryController.consistencyBonus(c),
);
router.put("/summary/consistency-bonus/:id", authMiddleware, superAdminMiddleware, (c) =>
  container.summaryController.grantConsistencyBonus(c),
);
router.delete("/summary/consistency-bonus/:id", authMiddleware, superAdminMiddleware, (c) =>
  container.summaryController.revokeConsistencyBonus(c),
);
router.get("/summary/testimonial", authMiddleware, adminMiddleware, (c) =>
  container.testimonialController.listByPeriod(c),
);
router.get("/summary/period-closing", authMiddleware, adminMiddleware, (c) =>
  container.summaryController.periodClosings(c),
);
router.put("/summary/period-closing", authMiddleware, superAdminMiddleware, (c) => container.summaryController.closePeriod(c));
router.delete("/summary/period-closing", authMiddleware, superAdminMiddleware, (c) =>
  container.summaryController.reopenPeriod(c),
);
router.get("/summary/target-override", authMiddleware, adminMiddleware, (c) =>
  container.targetOverrideController.list(c),
);
router.post("/summary/target-override", authMiddleware, superAdminMiddleware, (c) =>
  container.targetOverrideController.create(c),
);
router.put("/summary/target-override/:id", authMiddleware, superAdminMiddleware, (c) =>
  container.targetOverrideController.update(c),
);
router.delete("/summary/target-override/:id", authMiddleware, superAdminMiddleware, (c) =>
  container.targetOverrideController.remove(c),
);

// ACL: who can open the admin pages, with which role and branch — Super Admin only.
router.get("/summary/admin-access", authMiddleware, superAdminMiddleware, (c) => container.adminAccessController.list(c));
router.get("/summary/admin-access/candidates", authMiddleware, superAdminMiddleware, (c) =>
  container.adminAccessController.candidates(c),
);
router.post("/summary/admin-access", authMiddleware, superAdminMiddleware, (c) => container.adminAccessController.create(c));
router.put("/summary/admin-access/:id", authMiddleware, superAdminMiddleware, (c) =>
  container.adminAccessController.update(c),
);
router.delete("/summary/admin-access/:id", authMiddleware, superAdminMiddleware, (c) =>
  container.adminAccessController.remove(c),
);

// Read-only, for every signed-in user: the dashboard's term tooltips quote the period's actual rates.
router.get("/commission-rules/effective", authMiddleware, (c) => container.commissionRuleController.effective(c));
router.get("/summary/rules", authMiddleware, adminMiddleware, (c) => container.commissionRuleController.list(c));
router.get("/summary/rules/effective", authMiddleware, adminMiddleware, (c) =>
  container.commissionRuleController.effective(c),
);
router.get("/summary/rules/:id", authMiddleware, adminMiddleware, (c) => container.commissionRuleController.show(c));
router.post("/summary/rules", authMiddleware, superAdminMiddleware, (c) => container.commissionRuleController.create(c));
router.put("/summary/rules/:id", authMiddleware, superAdminMiddleware, (c) => container.commissionRuleController.update(c));
router.get("/summary/rules/:id/preview", authMiddleware, superAdminMiddleware, (c) =>
  container.commissionRuleController.preview(c),
);
router.post("/summary/rules/:id/publish", authMiddleware, superAdminMiddleware, (c) =>
  container.commissionRuleController.publish(c),
);
router.delete("/summary/rules/:id", authMiddleware, superAdminMiddleware, (c) =>
  container.commissionRuleController.remove(c),
);

// SDR commission rules: own versions, separate from the Home rules above.
router.get("/summary/sdr-rules", authMiddleware, adminMiddleware, (c) => container.sdrCommissionRuleController.list(c));
router.get("/summary/sdr-rules/effective", authMiddleware, adminMiddleware, (c) =>
  container.sdrCommissionRuleController.effective(c),
);
router.get("/summary/sdr-rules/:id", authMiddleware, adminMiddleware, (c) => container.sdrCommissionRuleController.show(c));
router.post("/summary/sdr-rules", authMiddleware, superAdminMiddleware, (c) => container.sdrCommissionRuleController.create(c));
router.put("/summary/sdr-rules/:id", authMiddleware, superAdminMiddleware, (c) => container.sdrCommissionRuleController.update(c));
router.get("/summary/sdr-rules/:id/preview", authMiddleware, superAdminMiddleware, (c) =>
  container.sdrCommissionRuleController.preview(c),
);
router.post("/summary/sdr-rules/:id/publish", authMiddleware, superAdminMiddleware, (c) =>
  container.sdrCommissionRuleController.publish(c),
);
router.delete("/summary/sdr-rules/:id", authMiddleware, superAdminMiddleware, (c) =>
  container.sdrCommissionRuleController.remove(c),
);

export default router;
