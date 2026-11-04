import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { preflight, type Limits } from "../../src/ingest/preflight.js";
import { makePdf, bytesOf, concat } from "./fixtures.js";

const limits: Limits = { max_pages: 150, max_documents: 10, max_images: 50, max_bytes_per_document: 26214400, max_bytes_total: 104857600 };
const three = () => makePdf([{ puts: [{ text: "Page one", x: 72, y: 700 }] }, { puts: [{ text: "Page two", x: 72, y: 700 }] }, {}]);

describe("preflight", () => {
  it("accepts a readable PDF and reports hash, size, and page count", async () => {
    const b = await three();
    const r = await preflight(b, "report.pdf", limits);
    expect(r).toMatchObject({ ok: true, byte_size: b.length, page_count: 3 });
    expect(r.ok && r.content_sha256).toBe(createHash("sha256").update(b).digest("hex"));
  });

  it("the same bytes always give the same hash; one changed byte gives another", async () => {
    const b = await three(), c = b.slice(); c[c.length - 1] = c[c.length - 1]! ^ 1;
    const [x, y, z] = await Promise.all([preflight(b, "a.pdf", limits), preflight(b.slice(), "b.pdf", limits), preflight(c, "c.pdf", limits)]);
    expect(x.ok && y.ok && x.content_sha256).toBe(y.ok && x.ok && y.content_sha256);
    expect(z.ok ? z.content_sha256 : "").not.toBe(x.ok ? x.content_sha256 : "x");
  });

  it("decides by content, not by the file name", async () => {
    expect((await preflight(await three(), "report.txt", limits)).ok).toBe(true);
    expect(await preflight(bytesOf("just some words"), "report.pdf", limits)).toEqual({ ok: false, reason: "not_a_pdf" });
  });

  it("rejects empty input", async () => {
    expect(await preflight(new Uint8Array(0), "report.pdf", limits)).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects ZIP and Office containers even when named .pdf", async () => {
    expect(await preflight(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), "report.pdf", limits)).toEqual({ ok: false, reason: "zip_or_office_container" });
    expect(await preflight(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "report.pdf", limits)).toEqual({ ok: false, reason: "zip_or_office_container" });
  });

  it("rejects executables and scripts even when named .pdf", async () => {
    for (const head of [[0x4d, 0x5a, 0x90, 0], [0x7f, 0x45, 0x4c, 0x46], [0x23, 0x21, 0x2f, 0x62], [0xcf, 0xfa, 0xed, 0xfe], [0xca, 0xfe, 0xba, 0xbe]])
      expect(await preflight(new Uint8Array(head), "report.pdf", limits), head.join()).toEqual({ ok: false, reason: "executable" });
  });

  it("rejects an encrypted PDF before reading it", async () => {
    const b = bytesOf("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 9 0 R >>\n%%EOF\n");
    expect(await preflight(b, "report.pdf", limits)).toEqual({ ok: false, reason: "encrypted" });
  });

  it("rejects a truncated PDF with a reason, without a crash", async () => {
    const b = await three();
    expect(await preflight(b.slice(0, Math.floor(b.length / 2)), "report.pdf", limits)).toEqual({ ok: false, reason: "unreadable" });
    expect(await preflight(bytesOf("%PDF-1.7\n"), "report.pdf", limits)).toEqual({ ok: false, reason: "unreadable" });
  });

  it("enforces the size limit and the page limit from the config", async () => {
    const b = await three();
    expect(await preflight(b, "r.pdf", { ...limits, max_bytes_per_document: b.length - 1 })).toEqual({ ok: false, reason: "too_large" });
    expect(await preflight(b, "r.pdf", { ...limits, max_bytes_per_document: b.length })).toMatchObject({ ok: true });
    expect(await preflight(b, "r.pdf", { ...limits, max_pages: 2 })).toEqual({ ok: false, reason: "too_many_pages" });
    expect(await preflight(b, "r.pdf", { ...limits, max_pages: 3 })).toMatchObject({ ok: true });
  });

  it("flags scripts, launch actions, and embedded files without running them", async () => {
    const b = concat(await three(), bytesOf("\n% /JavaScript /Launch /EmbeddedFile\n"));
    const r = await preflight(b, "report.pdf", limits);
    expect(r.ok && r.flags).toEqual(["has_javascript", "has_launch_action", "has_embedded_files"]);
    const clean = await preflight(await three(), "report.pdf", limits);
    expect(clean.ok && clean.flags).toEqual([]);
  });

  it("accepts a Node Buffer as well as a plain byte array", async () => {
    const b = await three();
    expect(await preflight(Buffer.from(b), "report.pdf", limits)).toMatchObject({ ok: true, page_count: 3 });
  });
});
