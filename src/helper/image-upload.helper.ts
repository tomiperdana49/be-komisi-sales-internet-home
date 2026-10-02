import { BadRequestException } from "../exception/http.exception";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES = 3;

export type ImageExtension = "png" | "jpg" | "webp" | "gif";

/**
 * Identifies an image by its leading bytes rather than the client-supplied
 * Content-Type, which anyone can set to "image/png" on an HTML or SVG file.
 * Uploads are served publicly from /uploads, so only these raster formats
 * (which can't carry script) are accepted.
 */
export function detectImageType(bytes: Uint8Array): ImageExtension | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith([0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return "gif"; // GIF8
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "webp"; // RIFF....WEBP
  return null;
}

/** Validates count, size and real format; returns each file with the extension it should be stored under. */
export async function validateImages(files: File[]): Promise<{ file: File; ext: ImageExtension }[]> {
  if (files.length > MAX_IMAGES) {
    throw new BadRequestException(`Maksimal ${MAX_IMAGES} gambar per feedback`);
  }
  const checked: { file: File; ext: ImageExtension }[] = [];
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException(`Ukuran gambar maksimal ${MAX_IMAGE_BYTES / 1024 / 1024} MB`, file.name);
    }
    // Size was checked above, so reading the file is bounded.
    const head = new Uint8Array(await file.arrayBuffer()).subarray(0, 16);
    const ext = detectImageType(head);
    if (!ext) {
      throw new BadRequestException("Lampiran harus berupa gambar PNG, JPG, WebP, atau GIF", file.name);
    }
    checked.push({ file, ext });
  }
  return checked;
}
