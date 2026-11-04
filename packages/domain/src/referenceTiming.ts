import type { Reference } from "@report-peepers/contracts";
import type { CaseSnapshot as Snap } from "@report-peepers/contracts";
import type { Issue } from "./integrity.js";
import { parseDay } from "./calc/time.js";

type Finding = Snap["findings"][number];

/** Publication facts. v0.2 snapshots store them on each reference; v0.1 callers supply them separately (ADR-003). */
export interface ReferenceTiming {
  reference_id: string;
  publication_status: "published" | "draft" | "withdrawn" | "superseded";
  published_on: string | null;
}

/**
 * Checks a finding's references against what was published when. Rules:
 * a draft is never cited as a requirement; a withdrawn or superseded source needs an explicit historical context;
 * an edition published after the report cannot support a claimed departure (it may be described as later guidance).
 */
export function checkReferenceUse(finding: Finding, refs: Reference[], timings: ReferenceTiming[], reportIssuedOn: string | null): Issue[] {
  const out: Issue[] = [];
  const isDeparture = finding.finding_type === "verified_reference_departure";
  finding.reference_bindings.forEach((b, j) => {
    const path = `${finding.id}.reference_bindings[${j}]`;
    const add = (code: string, message: string) => out.push({ code, path, message });
    const ref = refs.find((r) => r.id === b.reference_id);
    const timing = timings.find((t) => t.reference_id === b.reference_id);
    const verifiedUse = b.support_verified || b.applicability_verified || b.permission_verified;
    if (!verifiedUse && !isDeparture) return; // candidate bindings are not yet relied on
    if (!ref || !timing) return add("reference_timing_unknown", "No publication status or date is recorded for this source");
    if (timing.publication_status === "draft") return add("reference_draft_not_citable", "A draft or public-review text is not a published requirement");
    if (timing.publication_status === "withdrawn" || timing.publication_status === "superseded") {
      if (!/historical/i.test(ref.effective_context)) add("reference_withdrawn_needs_historical_context", "A withdrawn or superseded source needs an explicit historical context");
    }
    if (isDeparture) {
      const issued = parseDay(reportIssuedOn), published = parseDay(timing.published_on);
      if (issued === null || published === null) return add("reference_timing_unknown", "The report issue date or the source publication date is missing or unreadable");
      if (published > issued) add("reference_postdates_report", "This edition was published after the report was issued; it can be described as later guidance, not as a departure");
    }
  });
  return out;
}

/** Timings stored on the references of a v0.2 snapshot. A reference with no stored status gets no timing. */
export function timingsFromReferences(refs: Reference[]): ReferenceTiming[] {
  return refs.flatMap((r) => (r.publication_status ? [{ reference_id: r.id, publication_status: r.publication_status, published_on: r.published_on ?? null }] : []));
}
