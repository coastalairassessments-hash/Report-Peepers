import type { RatioResult } from "./ratio.js";
import type { CoverageResult } from "./monitoring.js";
import type { MoistureDescription } from "./moisture.js";

/**
 * One stored calculation. Derived values are separate records from reported values (spec section 16).
 * A "not computable" outcome is a record too, so a review can say why no number was given.
 */
export interface CalcRecord {
  id: string;
  kind: "indoor_outdoor_ratio" | "monitoring_coverage" | "moisture_scale";
  /** A derived value is computed here; a corrected value replaces nothing and points at the record it corrects (spec 16). */
  record_type: "derived" | "corrected";
  corrects_id?: string | null;
  status: "ok" | "not_computable";
  formula: string;
  inputs: Record<string, unknown>;
  units: string | null;
  rounding: string | null;
  result: Record<string, unknown>;
  limitations: string[];
  source_evidence_ids: string[];
}

export function ratioRecord(id: string, inputs: Record<string, unknown>, r: RatioResult, source_evidence_ids: string[]): CalcRecord {
  return r.status === "ok"
    ? { id, kind: "indoor_outdoor_ratio", record_type: "derived", corrects_id: null, status: "ok", formula: r.formula, inputs, units: r.unit, rounding: r.rounding, result: { ratio: r.ratio }, limitations: r.limitations, source_evidence_ids }
    : { id, kind: "indoor_outdoor_ratio", record_type: "derived", corrects_id: null, status: "not_computable", formula: "indoor / outdoor", inputs, units: null, rounding: null, result: { reason: r.reason }, limitations: [r.explanation], source_evidence_ids };
}

export function coverageRecord(id: string, inputs: Record<string, unknown>, r: CoverageResult, source_evidence_ids: string[]): CalcRecord {
  if (r.status === "not_computable")
    return { id, kind: "monitoring_coverage", record_type: "derived", corrects_id: null, status: "not_computable", formula: "observed readings / expected readings", inputs, units: null, rounding: null, result: { reason: r.reason }, limitations: ["Not enough valid data to describe coverage."], source_evidence_ids };
  const { limitations, ...result } = r;
  return { id, kind: "monitoring_coverage", record_type: "derived", corrects_id: null, status: "ok", formula: "observed readings / expected readings", inputs, units: "percent", rounding: "one decimal place", result, limitations, source_evidence_ids };
}

export function moistureRecord(id: string, inputs: Record<string, unknown>, r: MoistureDescription, source_evidence_ids: string[]): CalcRecord {
  return {
    id, kind: "moisture_scale", record_type: "derived", corrects_id: null, status: r.status, formula: "none (scale check only)", inputs, units: null, rounding: null,
    result: r.status === "ok" ? { label: r.label, isMoistureContent: r.isMoistureContent } : { label: r.label, reason: r.reason },
    limitations: r.status === "ok" ? [] : ["A comparative or unknown meter scale is not converted to percent moisture content."], source_evidence_ids,
  };
}
