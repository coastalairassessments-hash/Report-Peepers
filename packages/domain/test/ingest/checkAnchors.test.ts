import { describe, it, expect } from "vitest";
import example from "../../../../docs/spec/example_case.json" with { type: "json" };
import { extractDocument } from "../../src/ingest/extract.js";
import { findAnchor, pageOnlyAnchor } from "../../src/ingest/anchors.js";
import { checkAnchors } from "../../src/ingest/checkAnchors.js";
import { makePdf } from "./fixtures.js";

const DOC = "DOC-001-v1";
const snap = (): any => structuredClone(example);
const ev = (c: any) => c.evidence[0].anchor.exact_text as string;
const cl = (c: any) => c.claims[0].source_anchor.exact_text as string;
const docs = async (c: any) => ({
  [DOC]: await extractDocument(await makePdf([{ puts: [{ text: "Cover page", x: 72, y: 700 }] }, { puts: [{ text: ev(c), x: 72, y: 700, size: 10 }, { text: cl(c), x: 72, y: 680, size: 10 }] }])),
});
const codes = (i: { code: string }[]) => i.map((x) => x.code);

describe("checkAnchors", () => {
  it("with no documents supplied, nothing is checked", async () => {
    expect(checkAnchors(snap(), {})).toEqual([]);
  });

  it("words that are on the right page pass; a missing box is noted separately, not as a false anchor", async () => {
    const c = snap(), d = await docs(c);
    const issues = checkAnchors(c, d);
    expect(codes(issues)).not.toContain("anchor_text_not_on_page");
    expect(new Set(codes(issues))).toEqual(new Set(["anchor_box_missing"]));
    expect(issues.map((i) => i.path)).toEqual(["evidence[0].anchor", "claims[0].source_anchor"]);
  });

  it("anchors built from the page, with boxes, give no issues", async () => {
    const c = snap(), d = await docs(c);
    for (const [path, text] of [["evidence", ev(c)], ["claims", cl(c)]] as const) {
      const r = findAnchor(d[DOC]!, DOC, text, { page: 2 });
      if (r.status !== "found") throw new Error("setup");
      if (path === "evidence") c.evidence[0].anchor = r.anchor; else c.claims[0].source_anchor = r.anchor;
    }
    expect(checkAnchors(c, d)).toEqual([]);
  });

  it("changed words, a wrong page, or a missing page are flagged with the path", async () => {
    const c = snap(), d = await docs(c);
    c.evidence[0].anchor.exact_text = "A single closet reading was recorded during a visit.";
    c.claims[0].source_anchor.pdf_page_index_1based = 1;
    const issues = checkAnchors(c, d).filter((i) => i.code === "anchor_text_not_on_page");
    expect(issues.map((i) => i.path)).toEqual(["evidence[0].anchor", "claims[0].source_anchor"]);
    expect(issues[1]!.message).toContain("wrong_page");
    const e = snap(); e.evidence[0].anchor.pdf_page_index_1based = 40;
    expect(codes(checkAnchors(e, d))).toContain("anchor_text_not_on_page");
  });

  it("an anchor naming a document that was not read is flagged once documents are supplied", async () => {
    const c = snap(), d = await docs(c);
    c.evidence[0].anchor.document_version_id = "DOC-777-v1";
    const issues = checkAnchors(c, d);
    expect(issues.find((i) => i.path === "evidence[0].anchor")!.code).toBe("anchor_document_unread");
  });

  it("scanned pages: a page-only anchor passes, a claim of exact words does not", async () => {
    const c = snap();
    const d = { [DOC]: await extractDocument(await makePdf([{}, {}])) };
    c.evidence[0].anchor = pageOnlyAnchor(d[DOC]!, DOC, 2);
    c.claims[0].source_anchor.pdf_page_index_1based = 2;
    const issues = checkAnchors(c, d);
    expect(issues.filter((i) => i.path === "evidence[0].anchor")).toEqual([]);
    expect(issues.filter((i) => i.path === "claims[0].source_anchor").map((i) => i.code)).toEqual(["anchor_text_not_on_page"]);
  });
});
