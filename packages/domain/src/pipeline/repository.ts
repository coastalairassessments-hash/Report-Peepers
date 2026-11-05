import { createHash } from "node:crypto";
import { allowedNext } from "../caseStateMachine.js";
import { canon } from "../revision.js";
import type { Actor, CaseRecord, CaseRepository, FileStore } from "./types.js";

/** States in which a customer may still change their own case. */
const CUSTOMER_STATES = ["draft", "preflight", "scope_intake", "scope_confirmation", "awaiting_payment"];
/** Fields only the system or the release step may change. A customer's save must leave them as stored. */
const SYSTEM_FIELDS = ["reviewer_id", "snapshot", "issues", "attempts", "published_fingerprint", "released", "source"] as const;
const REVIEWER_FIELDS = ["answers", "scope", "source", "attempts"] as const;
/** A reviewer may tick issues off as acknowledged and change nothing else about them. */
const issuesIgnoringAck = (r: CaseRecord) => r.issues.map((i) => ({ ...i, acknowledged: false }));

const canSee = (a: Actor, r: CaseRecord) => a.role === "system" || (a.role === "customer" && r.owner_id === a.id) || (a.role === "reviewer" && r.reviewer_id === a.id);
const same = (x: unknown, y: unknown) => canon(x) === canon(y);

export class InMemoryCaseRepository implements CaseRepository {
  private rows = new Map<string, CaseRecord>();

  async create(actor: Actor, record: CaseRecord): Promise<void> {
    if (actor.role !== "customer" || record.owner_id !== actor.id) throw new Error("Access refused: only the customer can start their own case.");
    if (record.state !== "draft") throw new Error("A new case starts as a draft.");
    if (this.rows.has(record.id)) throw new Error("That case id is already used.");
    this.rows.set(record.id, structuredClone(record));
  }

  async get(actor: Actor, id: string): Promise<CaseRecord | null> {
    const r = this.rows.get(id);
    return r && canSee(actor, r) ? structuredClone(r) : null;
  }

  async list(actor: Actor): Promise<CaseRecord[]> {
    return [...this.rows.values()].filter((r) => canSee(actor, r)).map((r) => structuredClone(r));
  }

  async save(actor: Actor, next: CaseRecord): Promise<void> {
    const stored = this.rows.get(next.id);
    if (!stored || !canSee(actor, stored)) throw new Error("Access refused.");
    if (stored.state === "released") throw new Error("A released case is read-only.");
    if (next.owner_id !== stored.owner_id) throw new Error("The owner of a case cannot change.");
    if (next.state !== stored.state && !allowedNext(stored.state).includes(next.state)) throw new Error(`Refused: a case cannot go from ${stored.state} to ${next.state}.`);
    if (actor.role === "customer") {
      if (!CUSTOMER_STATES.includes(stored.state) || !(CUSTOMER_STATES.includes(next.state) || next.state === "ready_for_analysis")) throw new Error("Refused: the customer cannot change the case in this state.");
      for (const f of SYSTEM_FIELDS) if (f !== "source" && !same(next[f], stored[f])) throw new Error(`Refused: the customer cannot change ${f}.`);
    }
    if (actor.role === "reviewer") {
      if (stored.state !== "awaiting_reviewer") throw new Error("Refused: the reviewer can only act on a case awaiting review.");
      if (next.reviewer_id !== stored.reviewer_id) throw new Error("Refused: the reviewer cannot reassign the case.");
      for (const f of REVIEWER_FIELDS) if (!same(next[f], stored[f])) throw new Error(`Refused: the reviewer cannot change ${f}.`);
      if (!same(issuesIgnoringAck(next), issuesIgnoringAck(stored)) || stored.issues.some((i, k) => i.acknowledged && !next.issues[k]!.acknowledged)) throw new Error("Refused: the reviewer can only acknowledge issues, not change or remove them.");
    }
    this.rows.set(next.id, structuredClone(next));
  }
}

export class InMemoryFileStore implements FileStore {
  private blobs = new Map<string, Uint8Array>();
  async put(bytes: Uint8Array): Promise<string> {
    const ref = `file:${createHash("sha256").update(bytes).digest("hex")}`;
    this.blobs.set(ref, new Uint8Array(bytes));
    return ref;
  }
  async get(ref: string): Promise<Uint8Array> {
    const b = this.blobs.get(ref);
    if (!b) throw new Error("No such file.");
    return new Uint8Array(b);
  }
}
