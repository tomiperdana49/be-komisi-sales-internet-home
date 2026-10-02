/**
 * Customers whose InvoiceType 8 invoices still count for recurring commission —
 * the old Apps Script's INCLUDE_CUSTOMER_ID property. Comma-separated customer IDs;
 * empty means every InvoiceType 8 invoice is skipped.
 */
export const oldCustomerConfig = {
  includeInvoiceType8CustomerIds: (process.env.OLD_CUSTOMER_INCLUDE_CUSTOMER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
};
