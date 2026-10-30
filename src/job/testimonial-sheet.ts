import { container } from "../container";
import { googleConfig } from "../config/google.config";

// Full re-sync of every testimonial to the marketing sheet — for when a sync after a change failed.
async function run() {
  if (!googleConfig.testimonialSpreadsheetId) {
    console.log("GOOGLE_SPREADSHEET_ID_TESTIMONIAL is not set; nothing to sync.");
    return;
  }
  await container.testimonialService.syncSheet();
  console.log("Testimonial sheet synced.");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => container.closeConnections());
