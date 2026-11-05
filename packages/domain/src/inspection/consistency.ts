import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaseSnapshot } from "@report-peepers/contracts";
import type { ExtractedDocument } from "../ingest/extract.js";
import { loadExtractionConfig } from "../engine/extractEvidence.js";

type Evidence = CaseSnapshot["evidence"][number];
type Claim = CaseSnapshot["claims"][number];

interface Raw { [k: string]: unknown; location_label_patterns: string[]; label_min_chars: number }
export interface ConsistencyConfig {
  lex: Record<string, RegExp[]>;
  location_label_patterns: RegExp[];
  label_min_chars: number;
  hedge_words: string[];
}

/** Loads the lexicons. A pattern that does not compile stops the program, so a typo can never quietly turn a check off. */
export function loadConsistencyConfig(path = resolve(import.meta.dirname, "../../../../data/rules/consistency.json")): ConsistencyConfig {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Raw;
  const lex: Record<string, RegExp[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!Array.isArray(v) || k === "location_label_patterns") continue;
    try { lex[k] = (v as string[]).map((p) => new RegExp(p, "i")); } catch (e) { throw new Error(`consistency.json: bad pattern in ${k}: ${e instanceof Error ? e.message : e}`); }
  }
  const labels = raw.location_label_patterns.map((p) => new RegExp(p, "im"));
  return { lex, location_label_patterns: labels, label_min_chars: raw.label_min_chars, hedge_words: loadExtractionConfig().hedge_words };
}

/** One thing the plain-code checks found. It names the checklist topics it bears on and the rows behind it. Wording is added later, in the warm voice. */
export interface ConsistencyFlag {
  check: string;
  item_topics: string[];
  evidence_ids: string[];
  claim_ids: string[];
  page: number | null;
  detail: string;
}

const any = (res: RegExp[] | undefined, text: string) => (res ?? []).some((r) => r.test(text));
const hedged = (text: string, hedges: string[]) => { const t = ` ${text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ")} `; return hedges.some((h) => t.includes(` ${h} `)); };

/** True when a wet word appears and is not directly preceded by a negation ("no moisture", "not wet"). */
function callsWet(text: string, c: ConsistencyConfig): boolean {
  for (const re of c.lex.wet_words ?? []) {
    const g = new RegExp(re.source, "gi");
    for (let m = g.exec(text); m; m = g.exec(text)) {
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      if (!any(c.lex.negation_before_wet, before)) return true;
    }
  }
  return false;
}

interface Locs { page: number; at: number; value: string }
function labelsOnPage(text: string, page: number, c: ConsistencyConfig): Locs[] {
  const out: Locs[] = [];
  for (const re of c.location_label_patterns) {
    const g = new RegExp(re.source, "gim");
    for (let m = g.exec(text); m; m = g.exec(text)) out.push({ page, at: m.index, value: m[1]!.trim() });
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Checks over the evidence and claims, with no AI. Each check is conservative: it flags only when the report's own words show the gap,
 * and it names the rows. Absence is judged over the whole document, so a gap on one page cannot be cured by a page that was not read:
 * pass `allPagesRead: false` and every "nothing anywhere" check stays silent.
 */
export function checkConsistency(snap: Pick<CaseSnapshot, "evidence" | "claims">, doc: ExtractedDocument | null, c: ConsistencyConfig, allPagesRead = true): ConsistencyFlag[] {
  const flags: ConsistencyFlag[] = [];
  const ev = snap.evidence, cl = snap.claims;
  const rows: { id: string; kind: "e" | "c"; text: string; page: number | null }[] = [
    ...ev.map((e: Evidence) => ({ id: e.id, kind: "e" as const, text: e.statement, page: e.anchor.pdf_page_index_1based })),
    ...cl.map((x: Claim) => ({ id: x.id, kind: "c" as const, text: x.text + " " + (x.source_anchor.exact_text ?? ""), page: x.source_anchor.pdf_page_index_1based })),
  ];
  const ids = (rs: typeof rows) => ({ evidence_ids: rs.filter((r) => r.kind === "e").map((r) => r.id), claim_ids: rs.filter((r) => r.kind === "c").map((r) => r.id) });
  const flag = (check: string, item_topics: string[], rs: typeof rows, detail: string) => flags.push({ check, item_topics, ...ids(rs), page: rs.find((r) => r.page !== null)?.page ?? null, detail });
  const text = (r: { text: string }) => r.text;

  const wet = rows.filter((r) => callsWet(text(r), c));
  const readings = rows.filter((r) => any(c.lex.reading_patterns, text(r)));
  const air = rows.filter((r) => any(c.lex.air_sample_words, text(r)));
  const surface = rows.filter((r) => any(c.lex.surface_sample_words, text(r)));

  if (allPagesRead && wet.length && !readings.length) flag("wet_without_reading", ["Measured, with what", "Readings shown"], wet, "Something is called wet or damp, and no moisture reading appears anywhere in the report.");
  if (allPagesRead && readings.length && !rows.some((r) => any(c.lex.dry_reference_words, text(r)))) flag("reading_without_dry_standard", ["Dry standard"], readings, "Moisture readings are given, and no dry standard or reference reading is described.");
  if (allPagesRead && surface.length && !rows.some((r) => any(c.lex.surface_control_patterns, text(r)))) flag("surface_sample_without_control", ["Control for surface samples"], surface, "Surface samples were taken, and no control from a similar surface is described.");
  if (allPagesRead && air.length && !rows.some((r) => any(c.lex.outdoor_words, text(r)))) flag("air_without_outdoor_comparison", ["Outdoor comparison", "Indoor and outdoor compared"], air, "Air samples were taken, and no outdoor result or comparison appears.");

  for (const r of rows.filter((x) => x.kind === "c")) {
    const t = text(r);
    if (any(c.lex.enclosed_space_words, t) && /\b(airborne|air sample|aerosol)/i.test(t) && any(c.lex.room_air_reading_words, t)) flag("enclosed_air_read_as_room_air", ["Cavity and cabinet samples kept apart"], [r], "A sample from an enclosed space is used to describe the room or home.");
  }
  for (const r of rows.filter((x) => any(c.lex.threshold_patterns, text(x)))) flag("number_used_as_standard", ["No safe or unsafe numbers"], [r], "A number or the words safe or unsafe are used as a dividing line, with no source given.");
  for (const r of rows.filter((x) => any(c.lex.thermal_words, text(x)) && any(c.lex.thermal_moisture_words, text(x)))) if (allPagesRead && !readings.length) flag("thermal_without_meter", ["Thermal imaging used properly"], [r], "Thermal imaging is used to suggest moisture, and no meter reading appears to confirm it.");

  for (const x of cl) {
    if (x.claim_type === "health") flag("health_statement", ["Stays within expertise"], rows.filter((r) => r.id === x.id), "A statement about health effects appears.");
    if ((x.claim_type === "cause" || x.claim_type === "duration") && x.strength_in_report === "categorical") {
      const basis = ev.filter((e) => x.basis_evidence_ids.includes(e.id));
      if (basis.length && basis.every((e) => hedged(e.statement, c.hedge_words))) flag("firmer_than_evidence", ["Possible versus demonstrated"], [...rows.filter((r) => r.id === x.id), ...rows.filter((r) => basis.some((b) => b.id === r.id))], "A conclusion is stated flatly, and the evidence it rests on is hedged.");
    }
    if (x.claim_type === "remediation") {
      const basis = ev.filter((e) => x.basis_evidence_ids.includes(e.id));
      if (!basis.some((e) => any(c.lex.observation_words, e.statement))) flag("recommendation_without_support", ["Recommendation has support"], rows.filter((r) => r.id === x.id), "A recommendation does not point to any observation, reading or sample result.");
    }
  }
  const remed = cl.filter((x) => x.claim_type === "remediation");
  if (remed.length && remed.some((x) => any(c.lex.treatment_only_words, x.text + " " + (x.source_anchor.exact_text ?? ""))) && !remed.some((x) => any(c.lex.removal_words, x.text + " " + (x.source_anchor.exact_text ?? ""))) && allPagesRead)
    flag("treatment_without_removal", ["Physical removal"], rows.filter((r) => remed.some((x) => x.id === r.id)), "Treatment is recommended, and physical removal of growth or debris is not described.");

  // A number cited for one location that sits under another location in the lab table.
  if (doc) {
    const labelsByPage = new Map(doc.pages.map((p) => [p.index, labelsOnPage(p.text, p.index, c)] as const));
    const allLabels = [...labelsByPage.values()].flat().filter((l) => l.value.length >= c.label_min_chars);
    const where = (num: string): string[] => {
      const found: string[] = [];
      for (const p of doc.pages) {
        const labels = labelsByPage.get(p.index) ?? [];
        let from = 0;
        for (let i = p.text.indexOf(num, from); i >= 0; i = p.text.indexOf(num, from)) {
          const prior = labels.filter((l) => l.at < i).pop();
          if (prior) found.push(prior.value.toLowerCase());
          from = i + num.length;
        }
      }
      return found;
    };
    for (const x of cl) {
      const claimText = x.text.toLowerCase();
      const nums = (x.text.match(/\d{1,3}(?:,\d{3})+|\d{4,}/g) ?? []);
      const mentioned = [...new Set(allLabels.map((l) => l.value.toLowerCase()).filter((v) => claimText.includes(v)))];
      if (!mentioned.length) continue;
      for (const n of nums) {
        const under = where(n);
        if (under.length && !under.some((u) => mentioned.includes(u))) flag("value_under_other_location", ["Values placed under the right location"], rows.filter((r) => r.id === x.id), `A figure is cited for ${mentioned.join(", ")} but appears in the table under ${[...new Set(under)].join(", ")}.`);
      }
    }
  }
  return flags;
}
