import { ForbiddenException, BadRequestException } from "../exception/http.exception";

/**
 * Simulasi Komisi: two what-if percentages that the AM page applies to the
 * figures it SHOWS (new-customer commission before the performance penalty,
 * and recurring commission). Display only — no commission calculation reads
 * this. Kept in a small JSON file, not the database; only the accounts in
 * COMMISSION_SIMULATION_EMAILS (default tomi@nusa.id) may change it.
 */
export type CommissionSimulation = { newPct: number | null; oldPct: number | null };

const EMPTY: CommissionSimulation = { newPct: null, oldPct: null };

export const commissionSimulationEditors = (): string[] =>
  (process.env.COMMISSION_SIMULATION_EMAILS ?? "tomi@nusa.id")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

function toPct(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
}

export class CommissionSimulationService {
  constructor(private readonly filePath = "data/commission-simulation.json") {}

  canEdit(email: string | null | undefined): boolean {
    return commissionSimulationEditors().includes((email ?? "").trim().toLowerCase());
  }

  async get(): Promise<CommissionSimulation> {
    try {
      const file = Bun.file(this.filePath);
      if (!(await file.exists())) return { ...EMPTY };
      const raw = await file.json();
      return { newPct: toPct(raw?.newPct) ?? null, oldPct: toPct(raw?.oldPct) ?? null };
    } catch {
      // A damaged file means "no simulation" — never a broken AM page.
      return { ...EMPTY };
    }
  }

  async save(email: string | null | undefined, input: { newPct?: unknown; oldPct?: unknown }): Promise<CommissionSimulation> {
    if (!this.canEdit(email)) throw new ForbiddenException("Simulasi Komisi hanya bisa diatur oleh akun yang ditunjuk.");
    const newPct = toPct(input?.newPct);
    const oldPct = toPct(input?.oldPct);
    if (newPct === undefined || oldPct === undefined) throw new BadRequestException("Persen harus antara 0 dan 100.");
    const value = { newPct, oldPct };
    // Bun.write creates the data/ directory when it's missing.
    await Bun.write(this.filePath, JSON.stringify({ ...value, updatedBy: email, updatedAt: new Date().toISOString() }, null, 2));
    return value;
  }
}
