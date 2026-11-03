import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { feedbackConfig } from "../config/feedback.config";
import { tvConfig } from "../config/tv.config";

const UPLOAD_DIR = "uploads/tv-cutout";

/**
 * Background-removed copies of employee photos (white-background winner card on the TV
 * screen). Each photo URL is cut out once by scripts/cutout.py and kept in uploads; until it
 * exists the screen falls back to the original photo. Off when TV_CUTOUT_PYTHON isn't set.
 */
export class PhotoCutoutService {
  private readonly pending = new Set<string>();
  private readonly failed = new Set<string>();
  private running = false;

  /** Bump when scripts/cutout.py changes its output, so every photo is cut out again. */
  private static readonly VERSION = "2";

  private fileName(photoUrl: string) {
    return `${createHash("sha1").update(`${PhotoCutoutService.VERSION}:${photoUrl}`).digest("hex")}.png`;
  }

  /** The cutout's public URL when ready; otherwise null, and it is queued for the next batch. */
  urlFor(photoUrl: string | null | undefined): string | null {
    if (!tvConfig.cutoutPython || !photoUrl || !/^https?:\/\//.test(photoUrl)) return null;
    const name = this.fileName(photoUrl);
    if (existsSync(`${UPLOAD_DIR}/${name}`)) return `${feedbackConfig.appUrl}/api/uploads/tv-cutout/${name}`;
    if (!this.failed.has(photoUrl)) {
      this.pending.add(photoUrl);
      queueMicrotask(() => this.run());
    }
    return null;
  }

  /** One Python run per batch, so the model loads once for all queued photos. */
  private async run() {
    if (this.running || this.pending.size === 0) return;
    this.running = true;
    const batch = [...this.pending];
    this.pending.clear();
    const args: string[] = [];
    const downloads: string[] = [];
    try {
      for (const url of batch) {
        const res = await fetch(url).catch(() => null);
        if (!res?.ok) {
          this.failed.add(url);
          continue;
        }
        const name = this.fileName(url);
        const src = `${UPLOAD_DIR}/tmp/${name}.src`;
        await Bun.write(src, await res.arrayBuffer());
        downloads.push(src);
        args.push(src, `${UPLOAD_DIR}/${name}`);
      }
      if (args.length) {
        const proc = Bun.spawn([tvConfig.cutoutPython!, "-I", "scripts/cutout.py", ...args], { stdout: "ignore", stderr: "pipe" });
        if ((await proc.exited) !== 0) console.error("TV photo cutout failed:", await new Response(proc.stderr).text());
      }
      // Whatever still has no output failed; don't retry it on every refresh.
      for (const url of batch) if (!existsSync(`${UPLOAD_DIR}/${this.fileName(url)}`)) this.failed.add(url);
    } catch (e) {
      console.error("TV photo cutout failed:", e);
      batch.forEach((url) => this.failed.add(url));
    } finally {
      await Promise.all(downloads.map((f) => rm(f, { force: true })));
      this.running = false;
      if (this.pending.size) this.run();
    }
  }
}
