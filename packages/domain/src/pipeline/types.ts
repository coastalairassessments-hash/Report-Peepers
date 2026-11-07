import type { OutcomeStore } from "../analysis/weaknessReport.js";
import type { Checklist } from "../inspection/checklist.js";
import type { ConsistencyConfig } from "../inspection/consistency.js";
import type { SelfConsistencyConfig } from "../inspection/selfConsistency.js";
import type { EvidenceMapConfig } from "../inspection/evidenceMap.js";
import type { GapWording, InspectionReview } from "../inspection/gaps.js";
import type { OcrPort, PageRenderer } from "../ingest/ocr.js";
import type { CaseSnapshot, Scope } from "@report-peepers/contracts";
import type { CaseState } from "../caseStateMachine.js";
import type { Answers } from "../intake.js";
import type { ContextState, Expectations } from "../context.js";
import type { ScopeEffects } from "../inspection/gaps.js";
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
  stage: "upload" | "extraction" | "proposal" | "integrity" | "markup" | "inspection_review";
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
  /** When the review was delivered. The retention clock starts here (90 days, then deletion). */
  delivered_at?: string;
}

export interface CaseRecord {
  id: string;
  owner_id: string;
  /** When the case was started. Only the system sets it. Cases never delivered are deleted this long after (retention). */
  created_at?: string;
  reviewer_id: string | null;
  state: CaseState;
  answers: Answers;
  /** The client's context answers (buttons plus notes). Context only: never proof of a condition, never health-linked. */
  context?: ContextState;
  scope: Scope | null;
  source: { file_ref: string; sha256: string; byte_size: number; page_count: number; display_name: string } | null;
  snapshot: CaseSnapshot | null;
  issues: ProcessingIssue[];
  attempts: number;
  published_fingerprint: string | null;
  released: ReleasedOutputs | null;
  /** Written only by the system. The completeness list, the questions to ask, and the evidence map. */
  inspection_review?: InspectionReview | null;
}

export interface CaseRepository {
  create(actor: Actor, record: CaseRecord): Promise<void>;
  /** Null when the case does not exist or the actor may not see it; the two look the same. */
  get(actor: Actor, id: string): Promise<CaseRecord | null>;
  list(actor: Actor): Promise<CaseRecord[]>;
  save(actor: Actor, record: CaseRecord): Promise<void>;
  /** System only. Removes the case entirely (retention). */
  purge(actor: Actor, id: string): Promise<void>;
}

export interface FileStore {
  put(bytes: Uint8Array): Promise<string>;
  get(ref: string): Promise<Uint8Array>;
  /** Removes the file for good. Callers check that no live case still uses the reference. */
  delete(ref: string): Promise<void>;
}

/** Payment is deferred. This is only the yes/no fact the state machine already expects (ADR-001). */
export interface Entitlement { verified(caseId: string, ownerId: string): Promise<boolean> }

export interface PipelineConfig {
  max_analysis_attempts: number;
  rule_pack_version: string;
  reference_snapshot_id: string;
  whole_report_area: { id: string; name: string };
  /** ADR-006. Held-back items above this number send the case to needs attention instead of releasing. */
  auto_release?: { max_held_back: number };
}

export interface Services {
  repo: CaseRepository;
  files: FileStore;
  entitlement: Entitlement;
  model: ModelPort;
  records: RecordStore;
  /** Optional. When present, each automatic release run saves its outcome (released or needs attention, with gate ids only). */
  outcomes?: OutcomeStore;
  now: () => string;
  newId: (prefix: string) => string;
  limits: Limits;
  patterns: PatternList;
  extraction: ExtractionConfig;
  /** Optional. When present, pages with little or no text are also read from their images, on our own machine. */
  ocr?: { port: OcrPort; renderer: PageRenderer };
  /** Optional. When present, the inspection review runs: checklist, consistency checks, the evidence map, and the questions for the homeowner. */
  inspection?: { checklist: Checklist; consistency: ConsistencyConfig; selfConsistency: SelfConsistencyConfig; evidenceMap: EvidenceMapConfig; wording: GapWording; expectations?: Expectations; scopeEffects?: ScopeEffects };
  markup: MarkupConfig;
  pipeline: PipelineConfig;
}
