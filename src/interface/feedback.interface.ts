import type { ImageExtension } from "../helper/image-upload.helper";
export type FeedbackInput = {
  message: string;
  type: string;
  url?: string;
};

// Shape returned by the external feedback service.
export type FeedbackItem = {
  employeeId: string;
  name: string;
  image: string[];
  url: string;
  type: string;
  message: string;
  [key: string]: unknown;
};

export interface IFeedbackRepository {
  /** Saves uploaded images under uploads/feedback and returns their public URLs. */
  saveImages(employeeId: string, images: { file: File; ext: ImageExtension }[]): Promise<string[]>;
  /** Best-effort notification to the external feedback service — never throws. */
  notify(item: FeedbackItem): void;
  findAll(): Promise<FeedbackItem[]>;
}

export interface IFeedbackService {
  submitFeedback(
    employeeId: string,
    name: string,
    data: FeedbackInput,
    imageFiles: File[],
  ): Promise<string[]>;
  getByEmployeeId(employeeId: string): Promise<FeedbackItem[]>;
}
