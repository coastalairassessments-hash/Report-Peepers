/** A measured value as reported. "Not detected" and "unknown" are never numbers. */
export type Measured =
  | { kind: "detected"; value: number; unit: string; rawCount?: number }
  | { kind: "nondetect"; limit?: number; unit: string }
  | { kind: "unknown" };

/** What was counted: all spores together, or one named group. Totals and groups are different calculations. */
export type Basis = { type: "total" } | { type: "group"; name: string };

export type RatioResult =
  | { status: "ok"; ratio: number; formula: string; unit: string; rounding: string; limitations: string[] }
  | {
      status: "not_computable";
      reason: "outdoor_nondetect" | "indoor_nondetect" | "unknown_value" | "invalid_value" | "basis_mismatch" | "unit_mismatch" | "out_of_range";
      explanation: string;
    };

const sameBasis = (a: Basis, b: Basis) =>
  a.type === "total" ? b.type === "total" : b.type === "group" && a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

const bad = (v: unknown) => typeof v !== "number" || !Number.isFinite(v);
const no = (reason: Extract<RatioResult, { status: "not_computable" }>["reason"], explanation: string): RatioResult => ({ status: "not_computable", reason, explanation });

/**
 * Indoor / outdoor arithmetic comparison. Never divides by a nondetect, zero, or invalid value.
 * `lowRawCountAtOrBelow` comes from an approved rule file; with no value set, no threshold is applied.
 */
export function indoorOutdoorRatio(
  indoor: Measured,
  outdoor: Measured,
  basis: { indoor: Basis; outdoor: Basis },
  opts: { lowRawCountAtOrBelow?: number } = {},
): RatioResult {
  if (indoor.kind === "unknown" || outdoor.kind === "unknown") return no("unknown_value", "A value is missing, so no ratio is calculated.");
  for (const m of [indoor, outdoor]) {
    if (m.kind === "detected" && (bad(m.value) || m.value <= 0)) return no("invalid_value", "A detected value must be a positive number.");
    if (m.kind === "detected" && m.rawCount !== undefined && (bad(m.rawCount) || m.rawCount < 0)) return no("invalid_value", "A raw count must be zero or more.");
    if (m.kind === "nondetect" && m.limit !== undefined && (bad(m.limit) || m.limit < 0)) return no("invalid_value", "A detection limit must be zero or more.");
  }
  if (!sameBasis(basis.indoor, basis.outdoor)) return no("basis_mismatch", "Total-spore and single-group values are different calculations and are not compared.");
  if (indoor.unit !== outdoor.unit) return no("unit_mismatch", `Units differ (${indoor.unit} vs ${outdoor.unit}); no ratio is calculated.`);
  if (outdoor.kind === "nondetect") return no("outdoor_nondetect", "The outdoor result was not detected. That is not zero, so no ratio is calculated.");
  if (indoor.kind === "nondetect") return no("indoor_nondetect", "The indoor result was not detected, so no ratio is calculated.");

  const raw = indoor.value / outdoor.value;
  const ratio = Math.round(raw * 10) / 10;
  if (!Number.isFinite(raw) || !Number.isFinite(ratio) || ratio <= 0)
    return no("out_of_range", "The values are too far apart to give a meaningful ratio at this precision.");
  const limitations = [
    "Arithmetic comparison only. It is not a health or severity threshold.",
    "Sampling variability applies to both values.",
  ];
  const t = opts.lowRawCountAtOrBelow;
  if (t !== undefined && outdoor.rawCount !== undefined && outdoor.rawCount <= t)
    limitations.push(`Low outdoor raw count (${outdoor.rawCount}); the ratio is unstable.`);
  return { status: "ok", ratio, formula: "indoor / outdoor", unit: indoor.unit, rounding: "rounded to one decimal place", limitations };
}
