import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";

/**
 * Private-link access (STACK_BEFORE_BRICK_19, decision 2). No accounts and no passwords.
 * We email the homeowner a private link. Opening it asks for a one-time code sent to the same address. A session is read-only and covers one case.
 * Only hashes of the link token, the code and the session are stored. Every failure looks the same, so nothing is learned from a refusal.
 * Time, randomness and hashing come in from outside so tests are exact. The stored address is removed with the case (revokeCase).
 */
export interface AccessConfig { link_days: number; code_minutes: number; max_wrong_codes: number; session_minutes: number }
export interface AccessDeps { now: () => string; randomBytes: (n: number) => Uint8Array; hash: (s: string) => string }

export interface GrantRow {
  token_hash: string; case_id: string; email: string; expires_at: string;
  code_hash: string | null; code_expires_at: string | null; wrong: number; locked: boolean;
}
export interface SessionRow { session_hash: string; case_id: string; expires_at: string }
export interface GrantStore {
  putGrant(r: GrantRow): Promise<void>; getGrant(tokenHash: string): Promise<GrantRow | null>;
  putSession(r: SessionRow): Promise<void>; getSession(hash: string): Promise<SessionRow | null>;
  deleteCase(caseId: string): Promise<void>;
}

export class InMemoryGrantStore implements GrantStore {
  private grants = new Map<string, GrantRow>();
  private sessions = new Map<string, SessionRow>();
  async putGrant(r: GrantRow) { this.grants.set(r.token_hash, structuredClone(r)); }
  async getGrant(h: string) { const r = this.grants.get(h); return r ? structuredClone(r) : null; }
  async putSession(r: SessionRow) { this.sessions.set(r.session_hash, structuredClone(r)); }
  async getSession(h: string) { const r = this.sessions.get(h); return r ? structuredClone(r) : null; }
  async deleteCase(caseId: string) {
    for (const [k, v] of this.grants) if (v.case_id === caseId) this.grants.delete(k);
    for (const [k, v] of this.sessions) if (v.case_id === caseId) this.sessions.delete(k);
  }
  /** For tests: everything stored. */
  dump() { return { grants: [...this.grants.values()], sessions: [...this.sessions.values()] }; }
}

export function loadAccessConfig(path = resolve(import.meta.dirname, "../../../../data/rules/access.json")): AccessConfig {
  const c = JSON.parse(readFileSync(path, "utf8")) as AccessConfig;
  for (const k of ["link_days", "code_minutes", "max_wrong_codes", "session_minutes"] as const)
    if (!Number.isInteger(c[k]) || c[k] < 1) throw new Error(`access.json: ${k} must be a whole number of 1 or more.`);
  return c;
}

const FAIL = { ok: false } as const;
const b64url = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const addMs = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createAccess(deps: AccessDeps, store: GrantStore, cfg: AccessConfig) {
  const codeHash = (tokenHash: string, code: string) => deps.hash(`${tokenHash}:${code}`);
  const sixDigits = () => {
    for (;;) { const b = deps.randomBytes(4); const n = ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0; if (n < 4_000_000_000) return String(n % 1_000_000).padStart(6, "0"); }
  };
  return {
    /** The token goes in the emailed link. Only its hash is kept. */
    async issueLink(caseId: string, email: string): Promise<{ token: string }> {
      const addr = email.trim().toLowerCase();
      if (!EMAIL.test(addr)) throw new Error("That is not a usable email address.");
      const token = b64url(deps.randomBytes(32));
      await store.putGrant({ token_hash: deps.hash(token), case_id: caseId, email: addr, expires_at: addMs(deps.now(), cfg.link_days * 86_400_000), code_hash: null, code_expires_at: null, wrong: 0, locked: false });
      return { token };
    },

    /** Makes a fresh code for the link and says where to send it. The caller emails it. */
    async requestCode(token: string): Promise<{ ok: true; send_to: string; code: string } | typeof FAIL> {
      const g = await store.getGrant(deps.hash(token));
      if (!g || g.locked || Date.parse(g.expires_at) <= Date.parse(deps.now())) return FAIL;
      const code = sixDigits();
      await store.putGrant({ ...g, code_hash: codeHash(g.token_hash, code), code_expires_at: addMs(deps.now(), cfg.code_minutes * 60_000) });
      return { ok: true, send_to: g.email, code };
    },

    async verifyCode(token: string, code: string): Promise<{ ok: true; session: string } | typeof FAIL> {
      const th = deps.hash(token);
      const g = await store.getGrant(th);
      if (!g || g.locked || Date.parse(g.expires_at) <= Date.parse(deps.now())) return FAIL;
      if (!g.code_hash || !g.code_expires_at || Date.parse(g.code_expires_at) <= Date.parse(deps.now())) return FAIL;
      if (!same(g.code_hash, codeHash(th, String(code)))) {
        const wrong = g.wrong + 1;
        await store.putGrant({ ...g, wrong, locked: wrong >= cfg.max_wrong_codes });
        return FAIL;
      }
      await store.putGrant({ ...g, code_hash: null, code_expires_at: null, wrong: 0 });
      const session = b64url(deps.randomBytes(32));
      await store.putSession({ session_hash: deps.hash(session), case_id: g.case_id, expires_at: addMs(deps.now(), cfg.session_minutes * 60_000) });
      return { ok: true, session };
    },

    /** The case a session may read, or null. */
    async sessionCase(session: string): Promise<string | null> {
      const s = await store.getSession(deps.hash(session));
      return s && Date.parse(s.expires_at) > Date.parse(deps.now()) ? s.case_id : null;
    },

    /** Removes every link, code and session for a case (used when the case is deleted). */
    revokeCase: (caseId: string) => store.deleteCase(caseId),
  };
}
