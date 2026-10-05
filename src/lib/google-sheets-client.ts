import { GoogleSpreadsheet, type GoogleSpreadsheetRow } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { googleConfig } from "../config/google.config";

export class GoogleSheetsClient {
  private readonly auth: JWT;

  constructor() {
    this.auth = new JWT({
      email: googleConfig.serviceAccountEmail,
      key: googleConfig.privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
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
