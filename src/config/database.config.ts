export const appDbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // Return DATE columns as plain "YYYY-MM-DD" strings. As JS Dates they become
  // local midnight, which JSON-serializes to the previous day in UTC.
  dateStrings: ["DATE"] as "DATE"[],
};

// The billing/source system (NIS) that new-customer and old-customer jobs
// read invoices from — separate database from our own app DB above.
export const billingDbConfig = {
  host: process.env.NIS_DB_HOST,
  port: process.env.NIS_DB_PORT ? Number(process.env.NIS_DB_PORT) : 3306,
  user: process.env.NIS_DB_USER,
  password: process.env.NIS_DB_PASSWORD,
  database: process.env.NIS_DB_NAME,
};
