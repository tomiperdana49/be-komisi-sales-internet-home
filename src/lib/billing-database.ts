import mysql from "mysql2/promise";
import { billingDbConfig } from "../config/database.config";

// Network-level failures worth another try; SQL errors are not retried.
const TRANSIENT_ERROR_CODES = new Set([
  "PROTOCOL_CONNECTION_LOST",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ER_CON_COUNT_ERROR",
]);

export function isTransientDbError(error: unknown): boolean {
  const err = error as { code?: string; fatal?: boolean; message?: string } | null;
  if (!err) return false;
  if (err.code && TRANSIENT_ERROR_CODES.has(err.code)) return true;
  if (err.fatal === true) return true;
  return /connection lost|server closed the connection|getaddrinfo/i.test(err.message ?? "");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Connection pool for the billing/source system (NIS) that new-customer
 * and old-customer jobs read invoices from — separate from AppDatabase.
 *
 * NIS queries are read-only, so a dropped connection is retried a few
 * times (the pool hands out a fresh connection) before the job fails.
 */
export class BillingDatabase {
  private readonly pool: Pick<mysql.Pool, "query" | "end">;
  private readonly retryDelaysMs: number[];

  constructor(
    pool?: Pick<mysql.Pool, "query" | "end">,
    retryDelaysMs: number[] = [5_000, 15_000, 30_000],
  ) {
    this.pool = pool ?? mysql.createPool({ ...billingDbConfig, enableKeepAlive: true });
    this.retryDelaysMs = retryDelaysMs;
  }

  async query<T = any>(sql: string, values?: any[]): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const [results] = await this.pool.query(sql, values);
        return results as T;
      } catch (error) {
        const delay = this.retryDelaysMs[attempt];
        if (delay === undefined || !isTransientDbError(error)) throw error;
        const reason = (error as { code?: string; message?: string }).code ?? (error as Error).message;
        console.warn(`Koneksi NIS gagal (${reason}), mencoba lagi dalam ${delay / 1000} detik (percobaan ${attempt + 2}/${this.retryDelaysMs.length + 1})...`);
        await sleep(delay);
      }
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
