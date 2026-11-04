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
