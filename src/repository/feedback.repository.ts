import { feedbackConfig } from "../config/feedback.config";
import type { ImageExtension } from "../helper/image-upload.helper";
import type { FeedbackItem, IFeedbackRepository } from "../interface/feedback.interface";

const UPLOAD_DIR = "uploads/feedback";

export class FeedbackRepository implements IFeedbackRepository {
  /** Images must already be validated (validateImages); `ext` comes from the file's real bytes, never the client. */
  async saveImages(employeeId: string, images: { file: File; ext: ImageExtension }[]): Promise<string[]> {
    const timestamp = Date.now();
    const imageUrls: string[] = [];
    // employeeId comes from the verified token, but keep the file name to safe characters regardless.
    const safeId = employeeId.replace(/[^A-Za-z0-9_-]/g, "");

    for (let i = 0; i < images.length; i++) {
      const { file, ext } = images[i]!;
      const fileName = `${safeId}_${timestamp}_${i}.${ext}`;

      // Bun.write creates any missing parent directories automatically.
      await Bun.write(`${UPLOAD_DIR}/${fileName}`, file);

      imageUrls.push(`${feedbackConfig.appUrl}/uploads/feedback/${fileName}`);
    }

    return imageUrls;
  }

  notify(item: FeedbackItem): void {
    if (!feedbackConfig.feedbackUrl) return;

    fetch(feedbackConfig.feedbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    }).catch(() => {});
  }

  async findAll(): Promise<FeedbackItem[]> {
    if (!feedbackConfig.feedbackUrl) return [];

    const response = await fetch(feedbackConfig.feedbackUrl);
    if (!response.ok) return [];

    // The external service can respond 200 with an error payload (e.g. its
    // own script failing) instead of the expected array — degrade to empty
    // rather than let a shape mismatch blow up the caller.
    const data = await response.json();
    return Array.isArray(data) ? (data as FeedbackItem[]) : [];
  }
}
