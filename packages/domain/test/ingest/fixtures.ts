import { PDFDocument, StandardFonts, degrees } from "pdf-lib";

/** Synthetic PDFs for tests. Text is placed at known positions (points from the bottom-left, as PDF does). */
export interface Put { text: string; x: number; y: number; size?: number }
export interface PageSpec { puts?: Put[]; rotate?: 0 | 90 | 180 | 270; width?: number; height?: number }

export async function makePdf(pages: PageSpec[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const p of pages) {
    const page = doc.addPage([p.width ?? 612, p.height ?? 792]);
    for (const t of p.puts ?? []) page.drawText(t.text, { x: t.x, y: t.y, size: t.size ?? 12, font });
    if (p.rotate) page.setRotation(degrees(p.rotate));
  }
  return doc.save({ useObjectStreams: false });
}

export const bytesOf = (s: string): Uint8Array => new TextEncoder().encode(s);
export const concat = (...parts: Uint8Array[]): Uint8Array => { const o = new Uint8Array(parts.reduce((n, a) => n + a.length, 0)); let i = 0; for (const a of parts) { o.set(a, i); i += a.length; } return o; };
