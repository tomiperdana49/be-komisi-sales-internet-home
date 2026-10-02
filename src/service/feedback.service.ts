import { validateImages } from "../helper/image-upload.helper";
import type {
  FeedbackInput,
  FeedbackItem,
  IFeedbackRepository,
  IFeedbackService,
} from "../interface/feedback.interface";

export class FeedbackService implements IFeedbackService {
  constructor(private readonly feedbackRepository: IFeedbackRepository) {}

  async submitFeedback(
    employeeId: string,
    name: string,
    data: FeedbackInput,
    imageFiles: File[],
  ): Promise<string[]> {
    // Rejects the whole submission before anything is written to disk.
    const images = await validateImages(imageFiles);
    const imageUrls = await this.feedbackRepository.saveImages(employeeId, images);

    this.feedbackRepository.notify({
      employeeId: String(employeeId),
      name,
      image: imageUrls,
      url: data.url ?? "",
      type: data.type,
      message: data.message,
    });

    return imageUrls;
  }

  async getByEmployeeId(employeeId: string): Promise<FeedbackItem[]> {
    const items = await this.feedbackRepository.findAll();
    return items.filter((item) => String(item.employeeId) === String(employeeId));
  }
}
