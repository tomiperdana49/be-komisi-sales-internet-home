CREATE TABLE snapshots(
    id INT AUTO_INCREMENT PRIMARY KEY,
    period VARCHAR(6) NOT NULL,
    ai_invoice BIGINT NOT NULL,
    ai_receipt BIGINT NULL,
    customer_id VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255) NULL,
    customer_company VARCHAR(255) NULL,
    customer_service_id BIGINT NULL,
    customer_service_account VARCHAR(255) NULL,
    service_id VARCHAR(20) NULL,
    service_name VARCHAR(255) NULL,
    category VARCHAR(255) NULL,
    sales VARCHAR(255) NULL,
    manager VARCHAR(255) NULL,
    vendor VARCHAR(255) NULL,
    subscription DECIMAL(18,2) NULL,
    line_rental DECIMAL(18,2) NULL,
    paid_date DATE NULL,
    -- New-customer rows: the service's first activation (null = not activated yet).
    -- Migration: ALTER TABLE snapshots ADD COLUMN activation_date DATE NULL AFTER paid_date;
    activation_date DATE NULL,
    -- Payment transaction date (the date that places the invoice in a period);
    -- paid_date is finance's input date.
    -- Migration: ALTER TABLE snapshots ADD COLUMN transaction_date DATE NULL AFTER paid_date;
    transaction_date DATE NULL,
    month INT NULL,
    late_month INT DEFAULT 0,
    type ENUM('new','prorate','upgrade','recurring') NULL DEFAULT NULL,
    -- A "new" row that is really a renewal's price increase (billing counter > 1): commissioned as recurring.
    is_renewal BOOLEAN NOT NULL DEFAULT FALSE,
    referral_fee DECIMAL(15,2) DEFAULT 0,
    referral_type ENUM('OTC','Cashback', 'Monthly') NULL DEFAULT NULL,
    referral_name VARCHAR(255) NULL,
    business_operation ENUM('Internal', 'Resell') NULL DEFAULT NULL,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    is_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
    INDEX idx_snapshots_period (period)
);

CREATE TABLE snapshot_adjustment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ai_invoice BIGINT NOT NULL,
    employee_id VARCHAR(20) NOT NULL,
    old_value JSON NOT NULL,
    new_value JSON NOT NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_snapshot_adjustment_ai_invoice (ai_invoice)
);

-- Every approve/revoke of an invoice's late-payment waiver (snapshots.is_approved),
-- with who did it, when and why. Kept outside snapshots since re-pulls rebuild those rows.
-- Migration: run this CREATE TABLE before deploying the BE that writes it.
CREATE TABLE invoice_approval_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ai_invoice BIGINT NOT NULL,
    is_approved BOOLEAN NOT NULL,
    note TEXT NULL,
    employee_id VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_invoice_approval_log_ai_invoice (ai_invoice)
);

CREATE TABLE employee (
    id INT PRIMARY KEY,
    employee_id VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    photo_profile VARCHAR(255) NOT NULL,
    job_position VARCHAR(255) NOT NULL,
    organization_name VARCHAR(255) NOT NULL,
    job_level VARCHAR(50) NOT NULL,
    branch VARCHAR(255) NOT NULL,
    status VARCHAR(255) NOT NULL,
    manager_id INT NULL,
    has_dashboard BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Whether they were in admin_access at the last crawl; informational only —
    -- access checks read admin_access itself.
    is_admin BOOLEAN NOT NULL DEFAULT false,
    -- Epoch milliseconds; any token issued before this is rejected (set on logout).
    tokens_valid_after BIGINT NULL
);

CREATE TABLE status_period (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status ENUM('Probation', 'Permanent') NOT NULL DEFAULT 'Probation',
    target INT NOT NULL DEFAULT 0
);

CREATE TABLE consistency_bonus (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(20) NOT NULL,
    period VARCHAR(6) NOT NULL,
    amount DECIMAL(15,2) NOT NULL DEFAULT 1000000,
    note TEXT NOT NULL,
    months VARCHAR(50) NULL,
    service_count INT NULL,
    testimonial_link VARCHAR(500) NULL,
    granted_by VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_consistency_bonus_employee_period (employee_id, period)
);

CREATE TABLE churn (
    customer_service_id BIGINT PRIMARY KEY NOT NULL,
    customer_id VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255) NULL,
    customer_service_account VARCHAR(255) NULL,
    service_id VARCHAR(50) NULL,
    service_name VARCHAR(255) NULL,
    registration_date DATE NULL,
    unregistration_date DATE NULL,
    reason TEXT NULL,
    -- NIS close category (ServiceCloseStatusExisting / ServiceCloseCategoryDetail names).
    close_status VARCHAR(50) NULL,
    close_reason VARCHAR(150) NULL,
    period INT NOT NULL DEFAULT 1,
    price DECIMAL(18,2) NULL,
    sales_id VARCHAR(20) NULL,
    manager_id VARCHAR(20) NULL,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    -- Why an admin waived (approved) this churn, who did it and when; NULL while not approved.
    approval_note TEXT NULL,
    approved_by VARCHAR(20) NULL,
    approved_at TIMESTAMP NULL,
    -- NIS log call whose "Churn = false" block waived this churn; NULL when waived by hand.
    approval_log_call_id BIGINT NULL,
    -- Churn missed in its own period and deducted by hand in the period of this date (churn:carry).
    deduct_date DATE NULL,
    INDEX idx_churn_unregistration_date (unregistration_date),
    INDEX idx_churn_sales_id (sales_id)
);

-- Versioned commission rules edited from the admin "Aturan Komisi" page.
-- A period uses the latest published row with effective_period <= that
-- period; periods with none use DEFAULT_COMMISSION_RULES in code.
CREATE TABLE commission_rule_set (
    id INT AUTO_INCREMENT PRIMARY KEY,
    effective_period VARCHAR(6) NOT NULL,
    status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    rules JSON NOT NULL,
    note TEXT NOT NULL,
    created_by VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(20) NULL,
    updated_at TIMESTAMP NULL,
    published_by VARCHAR(20) NULL,
    published_at TIMESTAMP NULL,
    INDEX idx_commission_rule_set_lookup (status, effective_period)
);

-- Versioned SDR commission rules, edited from the admin "Aturan Komisi SDR"
-- page. Same shape and lookup as commission_rule_set, but its own versions:
-- periods with no published row use DEFAULT_SDR_RULES in code.
-- Migration for existing databases: run this CREATE TABLE as is.
CREATE TABLE sdr_commission_rule_set (
    id INT AUTO_INCREMENT PRIMARY KEY,
    effective_period VARCHAR(6) NOT NULL,
    status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    rules JSON NOT NULL,
    note TEXT NOT NULL,
    created_by VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(20) NULL,
    updated_at TIMESTAMP NULL,
    published_by VARCHAR(20) NULL,
    published_at TIMESTAMP NULL,
    INDEX idx_sdr_commission_rule_set_lookup (status, effective_period)
);

-- Migration for existing databases (snapshots.is_renewal):
-- ALTER TABLE snapshots ADD COLUMN is_renewal BOOLEAN NOT NULL DEFAULT FALSE AFTER type;

-- Migration for existing databases (churn waiver reason):
-- ALTER TABLE churn ADD COLUMN approval_note TEXT NULL AFTER is_approved,
--   ADD COLUMN approved_by VARCHAR(20) NULL AFTER approval_note,
--   ADD COLUMN approved_at TIMESTAMP NULL AFTER approved_by;

-- Migration for existing databases (logout revokes tokens):
-- ALTER TABLE employee ADD COLUMN tokens_valid_after BIGINT NULL;

-- Closed (frozen) commission periods: the hourly import/churn jobs skip
-- them, so signed-off numbers can't move. Closed/reopened from the admin
-- Summary toolbar.
CREATE TABLE period_closing (
    period VARCHAR(6) PRIMARY KEY,
    closed_by VARCHAR(20) NOT NULL,
    closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Manual New Achievement target for one Account Manager over a period
-- range (admin "Target AM" page). Outside the range the commission rules'
-- default target applies. Ranges of one AM never overlap (enforced in
-- TargetOverrideService). Only the AM's own commission uses it; their Sales
-- Manager's team target keeps the default.
CREATE TABLE target_override (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(20) NOT NULL,
    target INT NOT NULL,
    start_period VARCHAR(6) NOT NULL,
    end_period VARCHAR(6) NOT NULL,
    note TEXT NULL,
    created_by VARCHAR(20) NOT NULL,
    updated_by VARCHAR(20) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    INDEX idx_target_override_lookup (employee_id, start_period, end_period)
);

-- Migration for existing databases (churn close category from NIS):
-- ALTER TABLE churn ADD COLUMN close_status VARCHAR(50) NULL AFTER reason,
--   ADD COLUMN close_reason VARCHAR(150) NULL AFTER close_status;

-- Migration for existing databases (churn waived from an NIS log call):
-- ALTER TABLE churn ADD COLUMN approval_log_call_id BIGINT NULL AFTER approved_at;

-- Migration for existing databases (churn carried over to a later period):
-- ALTER TABLE churn ADD COLUMN deduct_date DATE NULL AFTER approval_log_call_id;

-- ACL for the admin pages, managed by Super Admins on the "Akses Admin" page.
-- super_admin: every branch, and the only role that can change anything.
-- admin: read-only, over every branch (branch NULL) or just `branch`.
-- employee:crawl keeps the people listed here (pulling in those outside the
-- sales hierarchy from Nusawork) and nobody else outside it.
CREATE TABLE admin_access (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(20) NOT NULL,
    role ENUM('super_admin', 'admin') NOT NULL DEFAULT 'admin',
    branch VARCHAR(255) NULL,
    note TEXT NULL,
    created_by VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(20) NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_admin_access_employee (employee_id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Customer testimonials an Account Manager collected, entered from their dashboard.
-- manager_id is their Sales Manager when the row was entered, so the team stays as it was.
CREATE TABLE testimonial (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(20) NOT NULL,
    manager_id VARCHAR(20) NULL,
    customer_id VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    testimonial_date DATE NOT NULL,
    link VARCHAR(500) NOT NULL,
    created_by VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(20) NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_testimonial_employee (employee_id),
    INDEX idx_testimonial_date (testimonial_date)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
