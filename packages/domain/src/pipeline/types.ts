import type { CaseSnapshot, Scope } from "@report-peepers/contracts";
import type { CaseState } from "../caseStateMachine.js";
import type { Answers } from "../intake.js";
import type { Limits } from "../ingest/preflight.js";
import type { ModelPort } from "../engine/port.js";
import type { ExtractionConfig } from "../engine/extractEvidence.js";
import type { MarkupConfig } from "../render/plan.js";
import type { PatternList } from "../analysis/patterns.js";
import type { RecordStore } from "../analysis/store.js";

/** Who is asking. Every repository call carries one; the system actor runs background steps. */
export type Actor = { role: "customer"; id: string } | { role: "reviewer"; id: string } | { role: "system" };

export interface ProcessingIssue {
  id: string;
  stage: "upload" | "extraction" | "proposal" | "integrity" | "markup";
  code: string;
  detail: string;
  page?: number;
  /** The reviewer must acknowledge each issue before release; nothing is dropped quietly. */
  acknowledged: boolean;
}

export interface ReleasedOutputs {
  markup_pdf: Uint8Array;
  text: string;
  hashes: { source_sha256: string; view_sha256: string; plan_sha256: string; output_sha256: string };
  record_id: string;
}

export interface CaseRecord {
  id: string;
  owner_id: string;
  reviewer_id: string | null;
  state: CaseState;
  answers: Answers;
  scope: Scope | null;
  source: { file_ref: string; sha256: string; byte_size: number; page_count: number; display_name: string } | null;
  snapshot: CaseSnapshot | null;
  issues: ProcessingIssue[];
  attempts: number;
  published_fingerprint: string | null;
  released: ReleasedOutputs | null;
}

export interface CaseRepository {
  create(actor: Actor, record: CaseRecord): Promise<void>;
  /** Null when the case does not exist or the actor may not see it; the two look the same. */
  get(actor: Actor, id: string): Promise<CaseRecord | null>;
  list(actor: Actor): Promise<CaseRecord[]>;
  save(actor: Actor, record: CaseRecord): Promise<void>;
}

export interface FileStore {
  put(bytes: Uint8Array): Promise<string>;
  get(ref: string): Promise<Uint8Array>;
}

/** Payment is deferred. This is only the yes/no fact the state machine already expects (ADR-001). */
export interface Entitlement { verified(caseId: string, ownerId: string): Promise<boolean> }

export interface PipelineConfig {
  max_analysis_attempts: number;
  rule_pack_version: string;
  reference_snapshot_id: string;
  whole_report_area: { id: string; name: string };
}

export interface Services {
  repo: CaseRepository;
  files: FileStore;
  entitlement: Entitlement;
  model: ModelPort;
  records: RecordStore;
  now: () => string;
  newId: (prefix: string) => string;
  limits: Limits;
  patterns: PatternList;
  extraction: ExtractionConfig;
  markup: MarkupConfig;
  pipeline: PipelineConfig;
}
