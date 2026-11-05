import type { CaseSnapshot } from "@report-peepers/contracts";

type Area = CaseSnapshot["areas"][number];
/** A name written in capitals is shown in ordinary capitalization; anything else keeps its own spelling. */
const display = (label: string): string => { const t = label.replace(/[:\s]+$/, "").replace(/\s+/g, " ").trim(); return t === t.toUpperCase() && /[A-Z]/.test(t) ? t.toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (_, a, b) => a + b.toUpperCase()) : t; };
const key = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Turns the room names the extraction found into areas. Names that differ only in case, spacing or punctuation are one room, and the first
 * spelling is kept. Rooms hang under the whole-report area. Anything with no name, or beyond the cap, stays in the whole-report area.
 */
export function buildAreas(labels: Record<string, string>, whole: { id: string; name: string }, cap = 80): { areas: Area[]; areaIdsFor: (itemId: string) => string[] } {
  const byKey = new Map<string, Area>();
  const idOf = new Map<string, string>();
  for (const [item, label] of Object.entries(labels)) {
    const k = key(label);
    if (!k) continue;
    let a = byKey.get(k);
    if (!a) {
      if (byKey.size >= cap) continue;
      a = { id: `AREA-${k.replace(/ /g, "-").slice(0, 60)}`, name: display(label), parent_id: whole.id, kind: "room", condition_status: "unclear_documentation", assessed_scope: "Named in the report; what was examined here is shown by the report's own statements.", time_context: null, basis_evidence_ids: [], uncertainties: [] };
      byKey.set(k, a);
    }
    idOf.set(item, a.id);
  }
  return { areas: [...byKey.values()], areaIdsFor: (item) => [idOf.get(item) ?? whole.id] };
}
