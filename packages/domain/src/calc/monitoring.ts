import { parseStamp } from "./time.js";

export type CoverageResult =
  | {
      status: "ok";
      start: string; end: string;
      expectedReadings: number; observedReadings: number; coveragePercent: number;
      gaps: { from: string; to: string; missingReadings: number }[];
      completeDays: string[]; partialDays: string[];
      flags: string[]; limitations: string[];
    }
  | { status: "not_computable"; reason: "too_few_readings" | "invalid_interval" };

const MIN = 60_000;
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };

/**
 * Shows what a monitoring record actually covers. Never fills gaps, never interpolates.
 * A day is complete only if readings reach both ends of that day and no gap falls inside it.
 * `gapAfterIntervals` is an engineering tolerance for clock jitter (default 1.5 intervals), not a scientific threshold.
 * Times are compared as written; offset changes and daylight-saving shifts are not adjusted.
 */
export function monitoringCoverage(timestamps: string[], intervalMinutes: number, opts: { gapAfterIntervals?: number } = {}): CoverageResult {
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return { status: "not_computable", reason: "invalid_interval" };
  const flags: string[] = [];
  const parsed = timestamps.map(parseStamp);
  if (parsed.some((p) => p === null)) flags.push("invalid_timestamp");
  const valid = parsed.filter((p): p is NonNullable<typeof p> => p !== null);

  const offsets = new Set(valid.map((p) => p.offset ?? "none"));
  if (offsets.size > 1) flags.push("mixed_offsets");
  if (valid.some((p) => p.offset === null)) flags.push("no_timezone_in_timestamps");

  let sorted = true;
  for (let i = 1; i < valid.length; i++) if (valid[i]!.wallMs < valid[i - 1]!.wallMs) sorted = false;
  if (!sorted) flags.push("unsorted_input");

  const walls = [...new Set(valid.map((p) => p.wallMs))].sort((a, b) => a - b);
  if (walls.length < valid.length) flags.push("duplicate_timestamps");
  if (walls.length < 2) return { status: "not_computable", reason: "too_few_readings" };

  const step = intervalMinutes * MIN;
  const tol = (opts.gapAfterIntervals ?? 1.5) * step;
  const start = walls[0]!, end = walls[walls.length - 1]!;
  const expected = Math.floor((end - start) / step) + 1;
  if (walls.length > expected) flags.push("denser_than_interval");
  const coveragePercent = Math.min(100, Math.round((walls.length / expected) * 1000) / 10);

  const gaps: { from: string; to: string; missingReadings: number; a: number; b: number }[] = [];
  for (let i = 1; i < walls.length; i++) {
    const a = walls[i - 1]!, b = walls[i]!;
    if (b - a > tol) gaps.push({ from: fmt(a), to: fmt(b), missingReadings: Math.max(1, Math.round((b - a) / step) - 1), a, b });
  }

  const DAY = 24 * 60 * MIN;
  const completeDays: string[] = [], partialDays: string[] = [];
  for (let d = Math.floor(start / DAY) * DAY; d <= end; d += DAY) {
    const label = fmt(d).slice(0, 10);
    const reachesStart = start <= d + tol;
    const reachesEnd = end >= d + DAY - tol;
    // the missing readings fall between (a + one interval) and (b - one interval)
    const hasGap = gaps.some((g) => g.a + step < d + DAY && g.b - step >= d);
    (reachesStart && reachesEnd && !hasGap ? completeDays : partialDays).push(label);
  }

  return {
    status: "ok", start: fmt(start), end: fmt(end),
    expectedReadings: expected, observedReadings: walls.length, coveragePercent,
    gaps: gaps.map(({ from, to, missingReadings }) => ({ from, to, missingReadings })),
    completeDays, partialDays, flags,
    limitations: ["Times are compared as written; offset changes and daylight-saving shifts are not adjusted.", "Gaps are shown as gaps. No values are filled in."],
  };
}
