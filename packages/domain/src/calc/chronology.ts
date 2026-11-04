import { parseStamp } from "./time.js";

export interface EventSplit { before: number[]; after: number[]; unknown: number[]; invalid: number[]; assumedUtc: number }

/**
 * Splits measurement times (by position) around an event such as a repair.
 * A missing time stays "unknown". An unreadable time is "invalid". Neither is guessed.
 * Times without an offset are compared as UTC and counted in `assumedUtc`.
 * A time at the same instant as the event counts as before.
 */
export function splitByEvent(times: (string | null)[], eventAt: string): EventSplit {
  const ev = parseStamp(eventAt);
  if (!ev) throw new Error(`Event time is not a readable timestamp: ${String(eventAt)}`);
  const out: EventSplit = { before: [], after: [], unknown: [], invalid: [], assumedUtc: ev.offset === null ? 1 : 0 };
  times.forEach((t, i) => {
    if (t === null) return void out.unknown.push(i);
    const p = parseStamp(t);
    if (!p) return void out.invalid.push(i);
    if (p.offset === null) out.assumedUtc++;
    (p.instantMs <= ev.instantMs ? out.before : out.after).push(i);
  });
  return out;
}

/** True when evidence from before and after the event is being combined as if it were one moment. */
export function mixesAcrossEvent(times: (string | null)[], eventAt: string): { mixed: boolean; unknownCount: number } {
  const s = splitByEvent(times, eventAt);
  return { mixed: s.before.length > 0 && s.after.length > 0, unknownCount: s.unknown.length + s.invalid.length };
}
