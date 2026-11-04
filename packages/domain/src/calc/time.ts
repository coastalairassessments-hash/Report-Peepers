/** Parsed timestamp. `wallMs` uses the clock fields as written (no offset applied); `instantMs` applies the offset. */
export interface Stamp { wallMs: number; instantMs: number; offset: string | null; day: string }

const RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

/** Strict ISO-like parser. Returns null for anything it cannot read exactly. No timezone is guessed. */
export function parseStamp(s: unknown): Stamp | null {
  if (typeof s !== "string") return null;
  const m = RE.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, sec, off] = m;
  const wallMs = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +(sec ?? 0));
  const back = new Date(wallMs);
  if (back.getUTCFullYear() !== +y! || back.getUTCMonth() !== +mo! - 1 || back.getUTCDate() !== +d! || +h! > 23 || +mi! > 59) return null;
  let offMin = 0;
  if (off && off !== "Z") {
    const sign = off[0] === "-" ? -1 : 1;
    const digits = off.slice(1).replace(":", "");
    offMin = sign * (+digits.slice(0, 2) * 60 + +digits.slice(2));
  }
  return { wallMs, instantMs: wallMs - offMin * 60_000, offset: off ?? null, day: `${y}-${mo}-${d}` };
}

/** Whole days since 1970-01-01 for a date or timestamp, or null if unreadable. No timezone is guessed. */
export function parseDay(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) {
    const ms = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!);
    const d = new Date(ms);
    if (d.getUTCFullYear() !== +m[1]! || d.getUTCMonth() !== +m[2]! - 1 || d.getUTCDate() !== +m[3]!) return null;
    return Math.floor(ms / 86_400_000);
  }
  const p = parseStamp(t);
  return p ? Math.floor(p.wallMs / 86_400_000) : null;
}
