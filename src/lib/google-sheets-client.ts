import { GoogleSpreadsheet, type GoogleSpreadsheetRow } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { googleConfig } from "../config/google.config";

/** A sheet row owned by the app: `values` fill columns A.. up to just before the key column. */
export type KeyedSheetRow = { key: string; values: (string | number)[] };

export class GoogleSheetsClient {
  private readonly auth: JWT;
  /** Write access, only for the sheets the app mirrors data to (shared with the service account as Editor). */
  private readonly writeAuth: JWT;

  constructor() {
    this.auth = new JWT({
      email: googleConfig.serviceAccountEmail,
      key: googleConfig.privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    this.writeAuth = new JWT({
      email: googleConfig.serviceAccountEmail,
      key: googleConfig.privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }

  /**
   * Makes a tab match `rows`, matching rows by the key column so whatever
   * people add to the right of it stays on the same row: rows whose key is
   * gone are deleted, the rest rewritten in place, new keys appended.
   * Rows without a key (typed by hand) are left alone. Row 1 is the header.
   * Values are USER_ENTERED, so pass text that must stay text (IDs with
   * leading zeros, names) through `asText`.
   */
  async syncKeyedRows(
    spreadsheetId: string,
    sheetTitle: string | null,
    key: { column: string; header: string },
    rows: KeyedSheetRow[],
  ): Promise<void> {
    const doc = new GoogleSpreadsheet(spreadsheetId, this.writeAuth);
    await doc.loadInfo();
    const sheet = sheetTitle ? doc.sheetsByTitle[sheetTitle] : doc.sheetsByIndex[0];
    if (!sheet) throw new Error(`Sheet "${sheetTitle}" tidak ditemukan di spreadsheet`);

    const keyColumn = key.column;
    const tab = `'${sheet.title.replace(/'/g, "''")}'`;
    const readKeys = async (): Promise<string[]> => {
      const cells: unknown[][] = (await sheet.getCellsInRange(`${keyColumn}1:${keyColumn}`)) ?? [];
      return cells.map((r) => String(r?.[0] ?? "").trim());
    };

    const wanted = new Set(rows.map((r) => r.key));
    let keys = await readKeys();

    // Delete bottom-up so earlier row indexes stay valid.
    const stale = keys.map((k, i) => (i > 0 && k && !wanted.has(k) ? i : -1)).filter((i) => i >= 0).reverse();
    if (stale.length > 0) {
      await doc.sheetsApi.post(":batchUpdate", {
        json: {
          requests: stale.map((i) => ({
            deleteDimension: { range: { sheetId: sheet.sheetId, dimension: "ROWS", startIndex: i, endIndex: i + 1 } },
          })),
        },
      });
      keys = await readKeys();
    }

    const rowOf = new Map(keys.map((k, i) => [k, i + 1] as const).filter(([k, n]) => k && n > 1));
    const data: { range: string; values: (string | number)[][] }[] = [{ range: `${tab}!${keyColumn}1`, values: [[key.header]] }];
    const added: (string | number)[][] = [];
    for (const row of rows) {
      const n = rowOf.get(row.key);
      if (n) data.push({ range: `${tab}!A${n}:${keyColumn}${n}`, values: [[...row.values, row.key]] });
      else added.push([...row.values, row.key]);
    }

    await doc.sheetsApi.post("values:batchUpdate", { json: { valueInputOption: "USER_ENTERED", data } });
    if (added.length > 0) {
      await doc.sheetsApi.post(`values/${encodeURIComponent(`${tab}!A1:${keyColumn}1`)}:append`, {
        searchParams: { valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS" },
        json: { values: added },
      });
    }
  }

  async getRows(
    sheetTitle: string,
    spreadsheetId: string,
  ): Promise<GoogleSpreadsheetRow[]> {
    const doc = new GoogleSpreadsheet(spreadsheetId, this.auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle[sheetTitle];
    if (!sheet) {
      throw new Error(`Sheet "${sheetTitle}" tidak ditemukan di spreadsheet`);
    }

    return sheet.getRows();
  }

  /** Raw cell values of each listed tab (null for a tab that doesn't exist), from one spreadsheet load. */
  async getValues(
    sheetTitles: string[],
    spreadsheetId: string,
    a1Range: string,
  ): Promise<(unknown[][] | null)[]> {
    const doc = new GoogleSpreadsheet(spreadsheetId, this.auth);
    await doc.loadInfo();

    const values: (unknown[][] | null)[] = [];
    for (const title of sheetTitles) {
      const sheet = doc.sheetsByTitle[title];
      values.push(sheet ? ((await sheet.getCellsInRange(a1Range, { valueRenderOption: "UNFORMATTED_VALUE" })) ?? []) : null);
    }
    return values;
  }
}

/** A USER_ENTERED value Sheets keeps as typed text (no number/date/formula parsing). */
export function asText(value: string | null | undefined): string {
  return value ? `'${value}` : "";
}
