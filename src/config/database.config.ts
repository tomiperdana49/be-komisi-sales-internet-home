export const appDbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
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
