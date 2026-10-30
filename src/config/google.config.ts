export const googleConfig = {
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  newCustomerSpreadsheetId: process.env.GOOGLE_SPREADSHEET_ID_NEW_CUSTOMER!,
  oldCustomerSpreadsheetId: process.env.GOOGLE_SPREADSHEET_ID_OLD_CUSTOMER!,
  /** Spreadsheet the referral team fills per period ("Medan 202609", ...). Unset = no referral fees on the NIS import. */
  resellerSpreadsheetId: process.env.GOOGLE_SPREADSHEET_ID_RESELLER || null,
  /** Spreadsheet the testimonials are mirrored to for marketing to check ("Home Testimonial"). Unset = no sync. */
  testimonialSpreadsheetId: process.env.GOOGLE_SPREADSHEET_ID_TESTIMONIAL || null,
  /** Its tab; unset = the first tab. */
  testimonialSheetTitle: process.env.GOOGLE_SHEET_TESTIMONIAL || null,
};
