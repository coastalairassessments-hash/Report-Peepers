import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { OcrLine, OcrPort, PageRenderer } from "./ocr.js";

const run = promisify(execFile);
const LIMITS = { timeout: 90_000, maxBuffer: 64 * 1024 * 1024 };

/** Draws a page with poppler's pdftoppm. No shell, a private temp folder, a time limit. Runs on our own machine only. */
export const popplerRenderer: PageRenderer = {
  async render(pdf, pageIndex1, dpi) {
    const dir = await mkdtemp(join(tmpdir(), "rp-render-"));
    try {
      await writeFile(join(dir, "in.pdf"), pdf);
      await run("pdftoppm", ["-r", String(dpi), "-f", String(pageIndex1), "-l", String(pageIndex1), "-png", "-singlefile", join(dir, "in.pdf"), join(dir, "out")], LIMITS);
      return new Uint8Array(await readFile(join(dir, "out.png")));
    } finally { await rm(dir, { recursive: true, force: true }); }
  },
};

/** Reads page images with the tesseract program installed on our own machine. Nothing is sent anywhere. */
export const tesseractPort: OcrPort = {
  async recognize(png) {
    const w = new DataView(png.buffer, png.byteOffset, png.byteLength).getUint32(16), h = new DataView(png.buffer, png.byteOffset, png.byteLength).getUint32(20);
    const dir = await mkdtemp(join(tmpdir(), "rp-ocr-"));
    try {
      await writeFile(join(dir, "page.png"), png);
      const { stdout } = await run("tesseract", [join(dir, "page.png"), "stdout", "--psm", "4", "-l", "eng", "tsv"], LIMITS);
      return linesFromTsv(stdout, w, h);
    } finally { await rm(dir, { recursive: true, force: true }); }
  },
};

/** Groups tesseract's word rows into lines. Exported for tests. */
export function linesFromTsv(tsv: string, width: number, height: number): OcrLine[] {
  const lines = new Map<string, { words: { t: string; c: number; x0: number; y0: number; x1: number; y1: number }[] }>();
  for (const row of tsv.split("\n").slice(1)) {
    const f = row.split("\t");
    if (f.length < 12 || f[0] !== "5") continue;
    const text = f.slice(11).join("\t").trim(), conf = Number(f[10]);
    if (!text || !(conf >= 0)) continue;
    const key = `${f[2]}-${f[3]}-${f[4]}`, x0 = Number(f[6]), y0 = Number(f[7]);
    const l = lines.get(key) ?? { words: [] };
    l.words.push({ t: text, c: conf, x0, y0, x1: x0 + Number(f[8]), y1: y0 + Number(f[9]) });
    lines.set(key, l);
  }
  return [...lines.values()].map(({ words }) => ({
    text: words.map((w) => w.t).join(" "),
    confidence: words.reduce((n, w) => n + w.c, 0) / words.length,
    box: [Math.min(...words.map((w) => w.x0)) / width, Math.min(...words.map((w) => w.y0)) / height, Math.max(...words.map((w) => w.x1)) / width, Math.max(...words.map((w) => w.y1)) / height] as [number, number, number, number],
  }));
}
