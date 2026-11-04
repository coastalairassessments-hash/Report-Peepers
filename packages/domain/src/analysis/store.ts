import type { SummaryRecord } from "./record.js";

const RECORD_KEYS = ["document_kinds", "items", "record_id", "release_month", "service_type"];
const ITEM_KEYS = ["decision_relevance", "evidence_strength", "finding_type", "next_step", "pattern_code", "question", "resolved_later", "reviewer_changed", "title", "wording_withheld"];
const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((k, i) => k === [...b].sort()[i]);

/** Defence in depth: the store refuses any record with a field the builder does not produce. */
export function isAllowedRecord(r: unknown): r is SummaryRecord {
  if (!r || typeof r !== "object") return false;
  const rec = r as Record<string, unknown>;
  if (!same(Object.keys(rec), RECORD_KEYS)) return false;
  if (typeof rec.release_month !== "string" || !/^\d{4}-\d{2}$/.test(rec.release_month)) return false;
  return Array.isArray(rec.items) && rec.items.every((i) => !!i && typeof i === "object" && same(Object.keys(i), ITEM_KEYS));
}

/** Where records are kept. No vendor is chosen: this port is all the rest of the system knows. Records carry no case link, so there is nothing to delete when a case's documents are. */
export interface RecordStore {
  save(record: SummaryRecord): Promise<void>;
  all(): Promise<readonly SummaryRecord[]>;
}

export class InMemoryRecordStore implements RecordStore {
  private rows: SummaryRecord[] = [];
  async save(record: SummaryRecord): Promise<void> {
    if (!isAllowedRecord(record)) throw new Error("Record refused: it holds a field that is not allowed.");
    if (this.rows.some((r) => r.record_id === record.record_id)) throw new Error("Record refused: that record id is already saved.");
    this.rows.push(structuredClone(record));
  }
  async all(): Promise<readonly SummaryRecord[]> { return structuredClone(this.rows); }
}
