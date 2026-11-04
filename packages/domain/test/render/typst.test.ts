import { describe, it, expect } from "vitest";
import { compileTypst, typstFonts } from "../../src/render/typst.js";
import { extractDocument } from "../../src/ingest/extract.js";

const hello = `#set page(width: 200pt, height: 100pt)\nHello world`;
const text = async (pdf: Uint8Array) => (await extractDocument(pdf)).pages.map((p) => p.text).join("\n");

describe("compileTypst", () => {
  it("compiles a document, and the same inputs give identical bytes", async () => {
    const a = await compileTypst({ template: hello, files: {} }), b = await compileTypst({ template: hello, files: {} });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(new TextDecoder().decode(a.pdf.slice(0, 5))).toBe("%PDF-");
    expect(Buffer.from(a.pdf).equals(Buffer.from(b.pdf))).toBe(true);
    expect(await text(a.pdf)).toContain("Hello world");
  });

  it("a different fixed creation time gives different bytes", async () => {
    const a = await compileTypst({ template: hello, files: {}, createdAt: 1704067200 }), b = await compileTypst({ template: hello, files: {}, createdAt: 1730000000 });
    expect(a.ok && b.ok && Buffer.from(a.pdf).equals(Buffer.from(b.pdf))).toBe(false);
  });

  it("a missing font fails the build instead of silently swapping another", async () => {
    const r = await compileTypst({ template: `#text(font: "NoSuchHandwriting")[hello]`, files: {} });
    expect(r).toMatchObject({ ok: false, reason: "warning" });
    expect(!r.ok && r.diagnostics).toMatch(/unknown font family/i);
  });

  it("the bundled handwriting font is available, and system fonts are not", async () => {
    const fonts = await typstFonts();
    expect(fonts).toContain("Caveat");
    for (const sys of ["Arial", "Helvetica", "Times New Roman", "Noto Sans"]) expect(fonts).not.toContain(sys);
    const r = await compileTypst({ template: `#set page(width: 300pt, height: 80pt)\n#text(font: "Caveat", fill: red, size: 20pt)[Ask about this]`, files: {} });
    expect(r.ok).toBe(true);
    expect(r.ok && (await text(r.pdf))).toContain("Ask about this");
  });

  it("a syntax error fails with diagnostics", async () => {
    const r = await compileTypst({ template: `#let x = (`, files: {} });
    expect(r).toMatchObject({ ok: false, reason: "typst_error" });
    expect(!r.ok && r.diagnostics.length).toBeGreaterThan(0);
  });

  it("a runaway template is killed by the time limit", async () => {
    const t0 = Date.now();
    const r = await compileTypst({ template: `#let total = 0\n#for i in range(2000000000) { total = total + i }\n#total`, files: {}, timeoutMs: 300 });
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
    expect(Date.now() - t0).toBeLessThan(10_000);
  });

  it("files are passed as data; the template reads them, and their text is never treated as template code", async () => {
    const evil = `#panic("injected") $ [ ] @x \`code\``;
    const r = await compileTypst({ template: `#set page(width: 400pt, height: 80pt)\n#let d = json("plan.json")\n#d.note`, files: { "plan.json": JSON.stringify({ note: evil }) } });
    expect(r.ok).toBe(true);
    expect(r.ok && (await text(r.pdf))).toContain("injected");
  });

  it("refuses file names that escape the work folder", async () => {
    for (const name of ["../x.json", "/etc/passwd", "a/../../b", "", "C:\\x"]) {
      expect(await compileTypst({ template: hello, files: { [name]: "{}" } }), name).toMatchObject({ ok: false, reason: "invalid_file_name" });
    }
  });

  it("refuses templates that pull in outside packages (no network)", async () => {
    expect(await compileTypst({ template: `#import "@preview/cetz:0.3.0": canvas`, files: {} })).toMatchObject({ ok: false, reason: "package_import_refused" });
    expect(await compileTypst({ template: `#import "@local/x:0.1.0"`, files: {} })).toMatchObject({ ok: false, reason: "package_import_refused" });
  });
});
