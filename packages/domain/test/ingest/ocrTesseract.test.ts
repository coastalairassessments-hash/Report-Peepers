import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linesFromTsv, popplerRenderer, tesseractPort } from "../../src/ingest/ocrTesseract.js";
import { ocrDocument } from "../../src/ingest/ocr.js";
import { findAnchor } from "../../src/ingest/anchors.js";
import { makePdf } from "./fixtures.js";
import { extractDocument } from "../../src/ingest/extract.js";

const have = (cmd: string): boolean => { try { execFileSync("which", [cmd], { stdio: "ignore" }); return true; } catch { return false; } };

describe("tesseract output", () => {
  it("groups word rows into lines with a normalized box and mean confidence", () => {
    const tsv = ["level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
      "5\t1\t1\t1\t1\t1\t100\t200\t100\t20\t90\tChaetomium", "5\t1\t1\t1\t1\t2\t210\t200\t20\t20\t80\t9", "5\t1\t1\t1\t2\t1\t100\t300\t50\t20\t95\tTotal"].join("\n");
    const l = linesFromTsv(tsv, 1000, 1000);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ text: "Chaetomium 9", confidence: 85 });
    expect(l[0]!.box).toEqual([0.1, 0.2, 0.23, 0.22]);
  });
});

describe.skipIf(!have("tesseract") || !have("pdftoppm"))("real reading of a page that is only a picture", () => {
  it("reads a lab-style table out of an image-only PDF and anchors on it", async () => {
    const text = await makePdf([{ puts: ["Aspergillus/Penicillium-Like 85 1,267", "Chaetomium 9 120", "Total Spores 97 1,293", "Detection Limit 13", "Sample ID Dining Room Air Cassette"].map((t, i) => ({ text: t, x: 60, y: 700 - i * 24, size: 14 })) }]);
    const dir = mkdtempSync(join(tmpdir(), "rp-t-"));
    writeFileSync(join(dir, "t.pdf"), text);
    execFileSync("pdftoppm", ["-r", "150", "-png", "-singlefile", join(dir, "t.pdf"), join(dir, "t")]);
    const img = await PDFDocument.create();
    const png = await img.embedPng(readFileSync(join(dir, "t.png")));
    const pg = img.addPage([612, 792]);
    pg.drawImage(png, { x: 0, y: 0, width: 612, height: 792 });
    const imageOnly = await img.save();
    const doc = await extractDocument(imageOnly);
    expect(doc.pages[0]!.quality_flags).toContain("no_text_layer");
    const out = await ocrDocument(doc, imageOnly, tesseractPort, popplerRenderer);
    expect(out.status).toBe("readable");
    const r = findAnchor(out, "DOC-001-v1", "Chaetomium 9 120");
    expect(r.status).toBe("found");
    if (r.status === "found") expect(r.anchor.extraction_method).toBe("ocr");
  }, 60_000);
});
