import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaseSnapshot } from "@report-peepers/contracts";
import { wordingProblems } from "../integrity.js";
import { citationProblems } from "../inspection/noCitations.js";
import { loadSuspiciousConfig } from "../ingest/suspicious.js";

/**
 * Interview gaps (PLAN_INTERVIEW 22a). Plain code reads the structured facts of a finished review and lists what the client could be asked about.
 * The question wording is fixed in data/rules/interview_gaps.json. The AI picks nothing, and no sentence from the report is copied into a question,
 * except a short, plain room name that has passed the checks below.
 */
export type Detector = "condensation_without_temperatures" | "readings_without_reference" | "excluded_room" | "sampling_only";
const DETECTORS: readonly Detector[] = ["condensation_without_temperatures", "readings_without_reference", "excluded_room", "sampling_only"];
const PER_AREA: readonly Detector[] = ["excluded_room"];

export interface GapRule { id: string; detector: Detector; params: Record<string, unknown>; question: string; select: "one" | "multi"; options: string[] }
export interface InterviewRules { max_gaps: number; leading_phrases: string[]; gaps: GapRule[] }
export interface Gap { key: string; gap_id: string; area_id: string | null; question: string; select: "one" | "multi"; options: string[] }

const ID = /^[a-z0-9_]{1,60}$/;
const fail = (m: string): never => { throw new Error(`interview_gaps.json: ${m}`); };
const strList = (x: unknown, what: string): string[] => { if (!Array.isArray(x) || !x.every((s) => typeof s === "string" && s.length > 0)) return fail(`${what} must be a list of text`); return x as string[]; };

/** Checks the rules, including that every question and option passes the customer-wording rules and does not lead. */
export function parseInterviewRules(raw: unknown): InterviewRules {
  const r = raw as Record<string, unknown>;
  if (typeof r !== "object" || r === null) return fail("not an object");
  if (!Number.isInteger(r.max_gaps) || (r.max_gaps as number) < 1) fail("max_gaps must be a whole number of 1 or more");
  const leading = strList(r.leading_phrases, "leading_phrases").map((s) => s.toLowerCase());
  if (!Array.isArray(r.gaps) || r.gaps.length === 0) fail("the gap list is empty");
  const seen = new Set<string>();
  const gaps = (r.gaps as Record<string, unknown>[]).map((g) => {
    const id = g.id;
    if (typeof id !== "string" || !ID.test(id)) return fail("every gap needs a plain id");
    if (seen.has(id)) fail(`gap ids must be unique (${id})`);
    seen.add(id);
    if (!DETECTORS.includes(g.detector as Detector)) fail(`gap ${id} has an unknown detector`);
    if (typeof g.question !== "string" || g.question.length < 5) fail(`gap ${id} needs a question`);
    const question = g.question as string;
    if (g.select !== "one" && g.select !== "multi") fail(`gap ${id}: select must be one or multi`);
    const options = strList(g.options, `gap ${id} options`);
    if (options.length < 2 || options.length > 8) fail(`gap ${id} needs 2 to 8 options`);
    const usesArea = question.includes("{area}");
    if (usesArea !== PER_AREA.includes(g.detector as Detector)) fail(`gap ${id}: {area} is used if and only if the gap is about one area`);
    const params = (typeof g.params === "object" && g.params !== null ? g.params : {}) as Record<string, unknown>;
    for (const text of [question.replace("{area}", "this area"), ...options]) {
      const lower = text.toLowerCase();
      if (leading.some((p) => lower.includes(p))) fail(`gap ${id} has leading wording: "${text}"`);
      if (wordingProblems(text).length || citationProblems(text).length) fail(`gap ${id} breaks the customer-wording rules: "${text}"`);
    }
    return { id, detector: g.detector as Detector, params, question, select: g.select as "one" | "multi", options };
  });
  return { max_gaps: r.max_gaps as number, leading_phrases: leading, gaps };
}

export function loadInterviewRules(path = resolve(import.meta.dirname, "../../../../data/rules/interview_gaps.json")): InterviewRules {
  return parseInterviewRules(JSON.parse(readFileSync(path, "utf8")));
}

const PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9 .,'&/#()-]{0,59}$/;
const FALLBACK_AREA = "one area of the report";
let phrases: RegExp[] | null = null;
/** A room name comes from the report, which is untrusted. Use it only if it is short, plain and does not read like an instruction. */
function safeAreaName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (!PLAIN_NAME.test(n) || n.split(" ").length > 6) return FALLBACK_AREA;
  phrases ??= loadSuspiciousConfig().instruction_phrases.map((p) => p.re);
  const flat = n.toLowerCase();
  return phrases.some((re) => re.test(flat)) ? FALLBACK_AREA : n;
}

const list = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);

export function detectGaps(s: CaseSnapshot, rules: InterviewRules): Gap[] {
  const out: Gap[] = [];
  const mk = (r: GapRule, area?: { id: string; name: string }): Gap => ({
    key: area ? `${r.id}:${area.id}` : r.id, gap_id: r.id, area_id: area?.id ?? null,
    question: area ? r.question.replace("{area}", safeAreaName(area.name)) : r.question, select: r.select, options: [...r.options],
  });
  for (const r of rules.gaps) {
    const p = r.params;
    switch (r.detector) {
      case "condensation_without_temperatures": {
        const kw = list(p.keywords).map((k) => k.toLowerCase()), qs = new Set(list(p.quantities));
        const named = s.claims.filter((c) => kw.some((k) => c.text.toLowerCase().includes(k)));
        const temps = s.measurements.filter((m) => qs.has(m.quantity));
        const missing = named.some((c) => (c.area_ids.length ? temps.filter((m) => c.area_ids.includes(m.area_id)) : temps).length === 0);
        if (missing) out.push(mk(r));
        break;
      }
      case "readings_without_reference": {
        const qs = new Set(list(p.quantities));
        if (s.measurements.some((m) => qs.has(m.quantity) && m.reference_measurement_ids.length === 0)) out.push(mk(r));
        break;
      }
      case "excluded_room": {
        const kinds = new Set(list(p.kinds));
        for (const a of s.areas) if (kinds.has(a.kind) && a.condition_status === "unassessed_inaccessible") out.push(mk(r, a));
        break;
      }
      case "sampling_only": {
        if (s.samples.length > 0 && s.measurements.length === 0 && !s.claims.some((c) => c.claim_type === "observation")) out.push(mk(r));
        break;
      }
    }
  }
  return out.slice(0, rules.max_gaps);
}
