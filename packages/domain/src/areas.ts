import type { Area } from "@report-peepers/contracts";

/** One key per room however it is typed: "Master Bath", "master  bath", "Master-Bath". */
export const areaKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Plain wording for an area's status. Fixed phrases only.
 * Never says an area is clean, unaffected, safe, or contaminated: silence and limited checks do not establish either.
 */
export function describeArea(a: Area): string {
  const scope = a.assessed_scope.trim();
  switch (a.condition_status) {
    case "documented_impact": return `Impact documented. Assessed scope: ${scope}`;
    case "possible_related_impact": return `Possible related impact, not established. Assessed scope: ${scope}`;
    case "assessed_no_indicators_reported": return `Assessed within this scope; no indicators reported. Assessed scope: ${scope} This is not a finding about anything outside that scope.`;
    case "unassessed_inaccessible": return `Not assessed or not accessible. No conclusion either way. ${scope}`;
    case "unclear_documentation": return `Documentation is unclear; clarification needed. ${scope}`;
    case "conflicting_evidence": return `Evidence conflicts; see the listed uncertainties. ${scope}`;
  }
}

/** Rooms or areas the client expects but the report never addresses. They get no status: not clean, not affected. */
export function unaddressedAreas(expectedNames: string[], areas: Area[]): string[] {
  const have = new Set(areas.map((a) => areaKey(a.name)));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of expectedNames) {
    const k = areaKey(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    if (!have.has(k)) out.push(n);
  }
  return out;
}
