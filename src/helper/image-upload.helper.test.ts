import { describe, expect, test } from "bun:test";
import { detectImageType, MAX_IMAGE_BYTES, validateImages } from "./image-upload.helper";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0];
const GIF = [...Buffer.from("GIF89a")];
const WEBP = [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 ")];
const file = (bytes: number[] | Uint8Array, type = "image/png", name = "a.png") => new File([new Uint8Array(bytes)], name, { type });

describe("image uploads", () => {
  test("recognises real PNG, JPEG, GIF and WebP by their bytes", () => {
    expect(detectImageType(new Uint8Array(PNG))).toBe("png");
    expect(detectImageType(new Uint8Array(JPG))).toBe("jpg");
    expect(detectImageType(new Uint8Array(GIF))).toBe("gif");
    expect(detectImageType(new Uint8Array(WEBP))).toBe("webp");
  });

  test("HTML or SVG disguised as image/png is rejected", async () => {
    const html = file([...Buffer.from("<html><script>alert(1)</script></html>")], "image/png", "x.png");
    const svg = file([...Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')], "image/svg+xml", "x.svg");
    await expect(validateImages([html])).rejects.toThrow("PNG, JPG, WebP, atau GIF");
    await expect(validateImages([svg])).rejects.toThrow("PNG, JPG, WebP, atau GIF");
  });

  test("the stored extension comes from the bytes, not the client's content type", async () => {
    const [checked] = await validateImages([file(JPG, "text/html", "evil.html")]);
    expect(checked!.ext).toBe("jpg");
  });

  test("too many or too large files are rejected", async () => {
    await expect(validateImages([file(PNG), file(PNG), file(PNG), file(PNG)])).rejects.toThrow("Maksimal 3");
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    await expect(validateImages([file(big)])).rejects.toThrow("maksimal 10 MB");
  });

  test("a normal screenshot submission passes", async () => {
    const result = await validateImages([file(PNG, "image/png", "screenshot.png")]);
    expect(result.map((r) => r.ext)).toEqual(["png"]);
  });
});
