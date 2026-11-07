import type { Reference } from "@report-peepers/contracts";

/**
 * Source-rights rules (MASTER_SPEC section 14). A reference is only as usable as its recorded rights allow:
 * - authorized needs a permission record on file;
 * - pending, blocked and metadata-only sources may be named, and nothing more (no retrieval, inference, embedding, output);
 * - training on any source is never allowed;
 * - a withdrawn or superseded source cannot be approved for output.
 * Problems name the reference and the rule only.
 */
export interface RightsProblem { reference_id: string; code: "authorized_without_permission_record" | "uses_beyond_rights" | "training_not_allowed" | "withdrawn_or_superseded_in_use"; detail: string }

export function sourceRightsProblems(refs: readonly Reference[]): RightsProblem[] {
  const out: RightsProblem[] = [];
  for (const r of refs) {
    const add = (code: RightsProblem["code"], detail: string) => out.push({ reference_id: r.id, code, detail });
    if (r.ai_use_status === "authorized" && !r.permission_record_id) add("authorized_without_permission_record", "Marked authorized with no permission record on file.");
    if (r.ai_use_status !== "authorized" && r.allowed_uses.some((u) => u !== "metadata")) add("uses_beyond_rights", `A source that is ${r.ai_use_status.replace(/_/g, " ")} may be named only.`);
    if (r.allowed_uses.includes("training")) add("training_not_allowed", "Training on a source is never allowed.");
    if ((r.publication_status === "withdrawn" || r.publication_status === "superseded") && r.ai_use_status === "authorized" && r.allowed_uses.includes("output_reference")) add("withdrawn_or_superseded_in_use", "A withdrawn or superseded source is approved for output.");
  }
  return out;
}
