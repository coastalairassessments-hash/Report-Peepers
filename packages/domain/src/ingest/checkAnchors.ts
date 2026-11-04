import type { CaseSnapshot } from "@report-peepers/contracts";
import type { Issue } from "../integrity.js";
import type { ExtractedDocument } from "./extract.js";
import { verifyAnchor } from "./anchors.js";

/**
 * Proves every anchor in a case against the documents it names (spec 9: findings trace to a real place in the source).
 * `docs` maps document_version_id to the extracted document. With no documents supplied nothing is checked,
 * so a case is judged as before. Once documents are supplied, an anchor naming a document that is not among them is flagged.
 * An anchor with exact words but no box is proven by its words and noted: the markup renderer needs the box.
 */
export function checkAnchors(s: CaseSnapshot, docs: Record<string, ExtractedDocument>): Issue[] {
  if (Object.keys(docs).length === 0) return [];
  const out: Issue[] = [];
  const one = (a: CaseSnapshot["evidence"][number]["anchor"], path: string) => {
    const doc = docs[a.document_version_id];
    if (!doc) return out.push({ code: "anchor_document_unread", path, message: `Document ${a.document_version_id} was not read, so this anchor cannot be proven` });
    const r = verifyAnchor(doc, a, { requireBox: false });
    if (!r.ok) return out.push({ code: "anchor_text_not_on_page", path, message: `The anchored words are not on that page as stated (${r.reason})` });
    if (a.exact_text !== null && a.bbox_normalized === null)
      out.push({ code: "anchor_box_missing", path, message: "The words are on the page but the anchor has no box, so a mark cannot be placed on them" });
  };
  s.evidence.forEach((e, i) => one(e.anchor, `evidence[${i}].anchor`));
  s.claims.forEach((c, i) => one(c.source_anchor, `claims[${i}].source_anchor`));
  return out;
}
