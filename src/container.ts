import { AppDatabase } from "./lib/app-database";
import { BillingDatabase } from "./lib/billing-database";
import { GoogleSheetsClient } from "./lib/google-sheets-client";
import { NusaworkClient } from "./lib/nusawork-client";

import { EmployeeRepository } from "./repository/employee.repository";
import { SnapshotRepository } from "./repository/snapshot.repository";
import { ServiceCatalogRepository } from "./repository/service-catalog.repository";
import { NewCustomerRepository } from "./repository/new-customer.repository";
import { OldCustomerRepository } from "./repository/old-customer.repository";
import { FeedbackRepository } from "./repository/feedback.repository";
import { ChurnRepository } from "./repository/churn.repository";
import { ConsistencyBonusRepository } from "./repository/consistency-bonus.repository";
import { CommissionRuleRepository } from "./repository/commission-rule.repository";

import { EmployeeService } from "./service/employee.service";
import { SnapshotService } from "./service/snapshot.service";
import { ServiceCatalogService } from "./service/service-catalog.service";
import { NewCustomerService } from "./service/new-customer.service";
import { OldCustomerService } from "./service/old-customer.service";
import { NusaworkService } from "./service/nusawork.service";
import { AuthService } from "./service/auth.service";
import { FeedbackService } from "./service/feedback.service";
import { ChurnService } from "./service/churn.service";
import { ConsistencyBonusService } from "./service/consistency-bonus.service";
import { CommissionService } from "./service/commission.service";
import { CommissionRuleService } from "./service/commission-rule.service";

import { HealthController } from "./controller/health.controller";
import { EmployeeController } from "./controller/employee.controller";
import { AuthController } from "./controller/auth.controller";
import { FeedbackController } from "./controller/feedback.controller";
import { CommissionController } from "./controller/commission.controller";
import { SummaryController } from "./controller/summary.controller";
import { CommissionRuleController } from "./controller/commission-rule.controller";

/**
 * Composition root: the one place the full dependency graph gets wired
 * together via constructor injection. Every other module should receive
 * its dependencies from here rather than constructing its own — that's
 * what makes each class swappable/testable in isolation.
 */
class Container {
  // Infra clients
  readonly appDatabase = new AppDatabase();
  readonly billingDatabase = new BillingDatabase();
  readonly sheetsClient = new GoogleSheetsClient();

  // Repositories
  readonly employeeRepository = new EmployeeRepository(this.appDatabase);
  readonly snapshotRepository = new SnapshotRepository(this.appDatabase);
  readonly serviceCatalogRepository = new ServiceCatalogRepository(this.billingDatabase);
  readonly newCustomerRepository = new NewCustomerRepository(
    this.billingDatabase,
    this.sheetsClient,
  );
  readonly oldCustomerRepository = new OldCustomerRepository(
    this.billingDatabase,
    this.sheetsClient,
  );
  readonly nusaworkClient = new NusaworkClient();
  readonly feedbackRepository = new FeedbackRepository();
  readonly churnRepository = new ChurnRepository(this.billingDatabase, this.appDatabase);
  readonly consistencyBonusRepository = new ConsistencyBonusRepository(this.appDatabase);
  readonly commissionRuleRepository = new CommissionRuleRepository(this.appDatabase);

  // Services
  readonly employeeService = new EmployeeService(this.employeeRepository);
  readonly snapshotService = new SnapshotService();
  readonly serviceCatalogService = new ServiceCatalogService(this.serviceCatalogRepository);
  readonly newCustomerService = new NewCustomerService(
    this.newCustomerRepository,
    this.employeeService,
    this.serviceCatalogService,
    this.snapshotService,
  );
  readonly oldCustomerService = new OldCustomerService(
    this.oldCustomerRepository,
    this.employeeService,
    this.serviceCatalogService,
    this.snapshotService,
  );
  readonly nusaworkService = new NusaworkService(this.nusaworkClient);
  readonly authService = new AuthService();
  readonly feedbackService = new FeedbackService(this.feedbackRepository);
  readonly churnService = new ChurnService(this.churnRepository);
  readonly consistencyBonusService = new ConsistencyBonusService(this.consistencyBonusRepository);
  readonly commissionRuleService = new CommissionRuleService(this.commissionRuleRepository, this.employeeService);
  readonly commissionService = new CommissionService(
    this.snapshotRepository,
    this.churnService,
    this.employeeService,
    this.consistencyBonusService,
    this.commissionRuleService,
  );

  // Controllers
  readonly healthController = new HealthController();
  readonly employeeController = new EmployeeController(this.employeeService);
  readonly authController = new AuthController(this.authService, this.employeeService);
  readonly feedbackController = new FeedbackController(this.feedbackService, this.employeeService);
  readonly commissionController = new CommissionController(this.commissionService);
  readonly summaryController = new SummaryController(
    this.commissionService,
    this.churnService,
    this.employeeService,
    this.consistencyBonusService,
  );
  readonly commissionRuleController = new CommissionRuleController(
    this.commissionRuleService,
    this.commissionService,
  );

  /** Closes every open DB connection pool — call before a job/process exits. */
  async closeConnections(): Promise<void> {
    await Promise.all([this.appDatabase.close(), this.billingDatabase.close()]);
  }
}

export const container = new Container();
