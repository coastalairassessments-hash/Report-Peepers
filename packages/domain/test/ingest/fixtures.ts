import { PDFDocument, PDFName, StandardFonts, degrees } from "pdf-lib";

/** Synthetic PDFs for tests. Text is placed at known positions (points from the bottom-left, as PDF does). */
export interface Put { text: string; x: number; y: number; size?: number }
export interface PageSpec { puts?: Put[]; rotate?: 0 | 90 | 180 | 270; width?: number; height?: number }

/** `labels`: the first page is labeled i (roman), the rest 1, 2, ... so printed labels differ from page indexes. */
export async function makePdf(pages: PageSpec[], opts: { labels?: boolean } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const p of pages) {
    const page = doc.addPage([p.width ?? 612, p.height ?? 792]);
    for (const t of p.puts ?? []) page.drawText(t.text, { x: t.x, y: t.y, size: t.size ?? 12, font });
    if (p.rotate) page.setRotation(degrees(p.rotate));
  }
  if (opts.labels) doc.catalog.set(PDFName.of("PageLabels"), doc.context.obj({ Nums: [0, { S: "r" }, 1, { S: "D" }] }));
  return doc.save({ useObjectStreams: false });
}

export const bytesOf = (s: string): Uint8Array => new TextEncoder().encode(s);
export const concat = (...parts: Uint8Array[]): Uint8Array => { const o = new Uint8Array(parts.reduce((n, a) => n + a.length, 0)); let i = 0; for (const a of parts) { o.set(a, i); i += a.length; } return o; };
