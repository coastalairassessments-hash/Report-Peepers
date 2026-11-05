import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaseSnapshot } from "@report-peepers/contracts";
import { wordingProblems } from "../integrity.js";
import type { Checklist, ChecklistItem } from "./checklist.js";
import type { ConsistencyFlag } from "./consistency.js";
import type { AreaMap } from "./evidenceMap.js";
import type { ReviewResult } from "./reviewItems.js";
import type { Contradiction } from "./selfConsistency.js";

export interface GapWording { group_order: string[]; have_record: string; not_performed: string; not_checked: string; checks: Record<string, { text: string; why: string }>; map: Record<string, { text: string; why: string }> }
export const loadGapWording = (path = resolve(import.meta.dirname, "../../../../data/rules/gap_wording.json")): GapWording => JSON.parse(readFileSync(path, "utf8")) as GapWording;

export interface ScopeEffects { labels: Record<string, string>; order: string[]; effects: Record<string, string[]>; wording: { scoped: string; scoped_why: string; not_expected: string } }
export const loadScopeEffects = (path = resolve(import.meta.dirname, "../../../../data/rules/scope_effects.json")): ScopeEffects => JSON.parse(readFileSync(path, "utf8")) as ScopeEffects;

export interface ReviewQuestion {
  id: string; kind: "checklist" | "consistency" | "contradiction" | "map" | "context" | "scope"; topic: string;
  /** True when a conclusion or recommendation leans on the gap, or the item is always material. Material questions go to page 1. */
  material: boolean;
  text: string; why: string;
  /** The "can you share it" line, when a record would answer the question. */
  request: string | null;
  page: number | null; quotes: { page: number; text: string }[];
  /** True when any words behind the question were read from an image. The text then asks for confirmation. */
  from_image: boolean;
  /** True when the homeowner said they received the record that would answer this. Then the ask is to upload it, not to request it. */
  have_record: boolean;
  /** Where it goes: the short list on page 1 (the biggest points the report leans on), or the notes. */
  placement: "page_one" | "notes";
}
export interface InspectionReview { covered: { group: string; topics: string[] }[]; questions: ReviewQuestion[]; not_checked: string[]; /** Topics a limit the client described explains, so they are not asked as gaps. */ not_expected: string[]; map: AreaMap[]; held_back: { id: string; problems: string[] }[] }

const IMAGE_NOTE = " This came from an image in the report, so please confirm it against the original.";
const CONCLUDING = new Set(["remediation", "cause", "health", "extent", "verification", "duration"]);

/**
 * Turns every gap the checks found into one list of questions for the homeowner to ask, in the warm voice, plus the list of what the report covers.
 * One materiality rule: an item is material when the report draws a conclusion or recommends work that could lean on it, or when it is always material;
 * always-minor items never are. Questions are drafts for the reviewer. Text that breaks a wording rule is held back and listed.
 */
export function buildInspectionReview(inp: { checklist: Checklist; review: ReviewResult; flags: ConsistencyFlag[]; contradictions: Contradiction[]; map: AreaMap[]; recordsReceived?: string[] | null; scope?: { restrictions: { kind: string; status: string }[] } | null; scopeEffects?: ScopeEffects; contextQuestions?: { id: string; topic: string; text: string; why: string }[]; leadingMax?: number; claims: Pick<CaseSnapshot["claims"][number], "claim_type">[]; imagePages: Set<number>; wording: GapWording }): InspectionReview {
  const { checklist, review, wording } = inp;
  const concluding = inp.claims.some((c) => CONCLUDING.has(c.claim_type));
  const byId = new Map(checklist.items.map((i) => [i.id, i]));
  const itemsByTopic = (topics: string[]): ChecklistItem[] => checklist.items.filter((i) => topics.includes(i.topic));
  const matFor = (items: ChecklistItem[]): boolean => items.some((i) => i.materiality === "always_material" || (i.materiality === "by_dependence" && concluding));
  const ranks = new Map<string, number>();
  // A present limit the client described explains some gaps. Only "present" counts; unknown or conflicting limits change nothing.
  const presentKinds = new Set((inp.scope?.restrictions ?? []).filter((r) => r.status === "present").map((r) => r.kind));
  const fx = inp.scopeEffects;
  const explainedBy = (topic: string): string | null => (fx ? fx.order.find((k) => presentKinds.has(k) && (fx.effects[k] ?? []).includes(topic)) ?? null : null);
  const suppressed = new Map<string, { topics: string[]; leaning: boolean }>();
  const suppress = (kind: string, topic: string, items: ChecklistItem[]) => {
    const e = suppressed.get(kind) ?? { topics: [], leaning: false };
    if (!e.topics.includes(topic)) e.topics.push(topic);
    if (matFor(items)) e.leaning = true;
    suppressed.set(kind, e);
  };
  const groupRank = (g: string): number => { const i = wording.group_order.indexOf(g); return (i < 0 ? wording.group_order.length : i) / 100; };
  const out: ReviewQuestion[] = [], held: { id: string; problems: string[] }[] = [];
  let n = 0;
  const push = (q: Omit<ReviewQuestion, "id" | "from_image" | "have_record" | "placement">, rank: number, kind?: string) => {
    const have_record = !!kind && !!inp.recordsReceived?.includes(kind);
    const id = `Q-${q.kind}-${++n}`;
    const from_image = q.quotes.some((x) => inp.imagePages.has(x.page)) || (q.page !== null && inp.imagePages.has(q.page) && q.kind !== "checklist");
    const text = from_image ? q.text + IMAGE_NOTE : q.text;
    const request = have_record ? wording.have_record : q.request;
    const problems = [...wordingProblems(text), ...wordingProblems(q.why), ...(request ? wordingProblems(request) : [])];
    if (problems.length) { held.push({ id, problems }); return; }
    out.push({ ...q, request, id, text, from_image, have_record, placement: "notes" }); ranks.set(id, rank);
  };

  // What the report covers, and the checklist gaps.
  const coveredBy = new Map<string, string[]>();
  for (const r of review.results) {
    const it = byId.get(r.item_id);
    if (!it) continue;
    if (r.status === "supported") { coveredBy.set(it.group, [...(coveredBy.get(it.group) ?? []), it.topic]); continue; }
    if (r.status !== "not_shown" && r.status !== "partly_shown") continue;
    const lim = explainedBy(it.topic);
    if (lim) { suppress(lim, it.topic, [it]); continue; }
    if (it.silence_is_ok) continue; // silence is fine for "no bad thing" items; a specific check raises them instead
    const text = r.gap_kind === "not_performed" ? wording.not_performed.replace("{topic}", it.topic.toLowerCase()) : it.leading_question;
    push({ kind: "checklist", topic: it.topic, material: matFor([it]), text, why: it.looks_for, request: it.record_request?.trim() || null, page: r.quotes[0]?.page ?? null, quotes: r.quotes.map((q) => ({ page: q.page, text: q.anchor?.exact_text ?? "" })).filter((q) => q.text) }, (it.materiality === "always_material" ? 2 : it.materiality === "by_dependence" ? 3 : 4) + groupRank(it.group), it.record_kind);
  }

  // Checks over the evidence and claims.
  for (const f of inp.flags) {
    const items = itemsByTopic(f.item_topics), first = items[0];
    if (!first) continue;
    const lim = explainedBy(first.topic);
    if (lim) { suppress(lim, first.topic, items); continue; }
    const w = wording.checks[f.check];
    push({ kind: "consistency", topic: first.topic, material: matFor(items), text: w?.text ?? first.leading_question, why: w?.why ?? first.looks_for, request: first.record_request?.trim() || null, page: f.page, quotes: [] }, (first.materiality === "always_material" ? 2 : first.materiality === "by_dependence" ? 3 : 4) + groupRank(first.group));
  }

  // The report against itself: both sides stay in `quotes`, apart from the wording.
  for (const c of inp.contradictions) {
    const w = wording.checks[c.check];
    if (!w) continue;
    push({ kind: "contradiction", topic: c.item_topics[0] ?? c.check, material: matFor(itemsByTopic(c.item_topics)), text: w.text, why: w.why, request: null, page: c.quotes[0]?.page ?? null, quotes: c.quotes.map((q) => ({ page: q.page, text: q.text })) }, 1);
  }

  // The evidence map's room-level gaps.
  for (const a of inp.map) for (const g of a.gaps) {
    const w = wording.map[g.rule];
    if (!w) continue;
    push({ kind: "map", topic: g.topic, material: g.material, text: w.text.replace("{area}", a.name), why: w.why, request: null, page: g.page, quotes: [] }, 0);
  }

  // Gaps a described limit explains: listed as not expected; one gentle question if the report still draws conclusions.
  const not_expected: string[] = [];
  if (fx) for (const [kind, e] of suppressed) {
    const limit = fx.labels[kind] ?? "the limit";
    not_expected.push(fx.wording.not_expected.replace("{topics}", e.topics.join(", ")).replace("{limit}", limit));
    if (concluding && e.leaning) push({ kind: "scope", topic: `Conclusions and ${limit}`, material: false, text: fx.wording.scoped.replace("{limit}", limit), why: fx.wording.scoped_why, request: null, page: null, quotes: [] }, 5);
  }

  // What the client said led up to the inspection, where the report is silent. The client's account is context, not proof.
  for (const c of inp.contextQuestions ?? []) push({ kind: "context", topic: c.topic, material: true, text: c.text, why: c.why, request: null, page: null, quotes: [] }, 1.5);

  // A question from a specific check replaces the general checklist question on the same topic.
  const specific = new Set(out.filter((q) => q.kind !== "checklist").map((q) => q.topic));
  for (let i = out.length - 1; i >= 0; i--) if (out[i]!.kind === "checklist" && specific.has(out[i]!.topic)) out.splice(i, 1);
  out.sort((a, b) => Number(b.material) - Number(a.material) || (ranks.get(a.id) ?? 9) - (ranks.get(b.id) ?? 9));
  let onPageOne = 0;
  for (const q of out) if (q.material && onPageOne < (inp.leadingMax ?? 5)) { q.placement = "page_one"; onPageOne++; }
  const not_checked = review.page_issues.map((p) => wording.not_checked.replace("{detail}", `page ${p.page}: ${p.detail}`));
  const unchecked = review.results.filter((r) => r.status === "not_verifiable").length;
  if (unchecked > 0) not_checked.push(`${unchecked} item${unchecked === 1 ? "" : "s"} couldn't be checked because some pages couldn't be read.`);
  const covered = [...coveredBy.entries()].map(([group, topics]) => ({ group, topics }));
  return { covered, questions: out, not_checked, not_expected, map: inp.map, held_back: held };
}
