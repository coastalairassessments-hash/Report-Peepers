import { describe, it, expect } from "vitest";
import { createAccess, InMemoryGrantStore, loadAccessConfig } from "../../src/access/access.js";
import { createHash } from "node:crypto";

const cfg = loadAccessConfig();
function setup() {
  const clock = { ms: Date.UTC(2026, 10, 6, 12, 0, 0) };
  let seed = 0;
  const deps = {
    now: () => new Date(clock.ms).toISOString(),
    randomBytes: (n: number) => { seed++; return Uint8Array.from({ length: n }, (_, i) => (seed * 37 + i * 11 + 5) % 256); },
    hash: (s: string) => createHash("sha256").update(s).digest("hex"),
  };
  const bump = () => { seed++; };
  const store = new InMemoryGrantStore();
  const access = createAccess(deps, store, cfg);
  const minutes = (m: number) => { clock.ms += m * 60_000; };
  return { access, store, minutes, bump, clock };
}

describe("link and one-time code access", () => {
  it("issues a link, sends a code to the stored address, and opens a read-only session for that case", async () => {
    const { access } = setup();
    const { token } = await access.issueLink("CASE-1", "Pat@Example.com");
    const sent = await access.requestCode(token);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.send_to).toBe("pat@example.com");
    expect(sent.code).toMatch(/^\d{6}$/);
    const v = await access.verifyCode(token, sent.code);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(await access.sessionCase(v.session)).toBe("CASE-1");
    expect(await access.sessionCase("nonsense")).toBeNull();
  });

  it("stores only hashes of the token, the code and the session, never the raw values", async () => {
    const { access, store } = setup();
    const { token } = await access.issueLink("CASE-1", "pat@example.com");
    const sent = await access.requestCode(token);
    if (!sent.ok) throw new Error("x");
    const v = await access.verifyCode(token, sent.code);
    if (!v.ok) throw new Error("x");
    const dump = JSON.stringify(store.dump());
    expect(dump).not.toContain(token);
    expect(dump).not.toContain(sent.code);
    expect(dump).not.toContain(v.session);
  });

  it("a code works once", async () => {
    const { access } = setup();
    const { token } = await access.issueLink("CASE-1", "pat@example.com");
    const s = await access.requestCode(token); if (!s.ok) throw new Error("x");
    expect((await access.verifyCode(token, s.code)).ok).toBe(true);
    expect((await access.verifyCode(token, s.code)).ok).toBe(false);
  });

  it("a code expires", async () => {
    const { access, minutes } = setup();
    const { token } = await access.issueLink("CASE-1", "pat@example.com");
    const s = await access.requestCode(token); if (!s.ok) throw new Error("x");
    minutes(cfg.code_minutes + 1);
    expect((await access.verifyCode(token, s.code)).ok).toBe(false);
  });

  it("the link expires, and an expired link cannot even ask for a code", async () => {
    const { access, minutes } = setup();
    const { token } = await access.issueLink("CASE-1", "pat@example.com");
    minutes(cfg.link_days * 24 * 60 + 1);
    expect((await access.requestCode(token)).ok).toBe(false);
  });

  it("locks the link after too many wrong codes, even for the right code afterwards", async () => {
    const { access } = setup();
    const { token } = await access.issueLink("CASE-1", "pat@example.com");
    const s = await access.requestCode(token); if (!s.ok) throw new Error("x");
    const wrong = s.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < cfg.max_wrong_codes; i++) expect((await access.verifyCode(token, wrong)).ok).toBe(false);
    expect((await access.verifyCode(token, s.code)).ok).toBe(false);
    expect((await access.requestCode(token)).ok).toBe(false);
  });

  it("every failure looks the same: no reason is given", async () => {
    const { access, minutes } = setup();
    const { token } = await access.issueLink("CASE-1", "pat@example.com");
    const unknown = await access.verifyCode("no-such-token", "123456");
    const noCode = await access.verifyCode(token, "123456");
    const s = await access.requestCode(token); if (!s.ok) throw new Error("x");
    minutes(cfg.code_minutes + 1);
    const expired = await access.verifyCode(token, s.code);
    expect(unknown).toEqual({ ok: false });
    expect(noCode).toEqual({ ok: false });
    expect(expired).toEqual({ ok: false });
  });

  it("another case's token never opens this case", async () => {
    const { access, bump } = setup();
    const a = await access.issueLink("CASE-1", "a@example.com"); bump();
    const b = await access.issueLink("CASE-2", "b@example.com");
    const sa = await access.requestCode(a.token); const sb = await access.requestCode(b.token);
    if (!sa.ok || !sb.ok) throw new Error("x");
    expect((await access.verifyCode(a.token, sb.code === sa.code ? "999999" : sb.code)).ok).toBe(false);
    const va = await access.verifyCode(a.token, sa.code); if (!va.ok) throw new Error("x");
    expect(await access.sessionCase(va.session)).toBe("CASE-1");
  });

  it("a session expires", async () => {
    const { access, minutes } = setup();
    const { token } = await access.issueLink("CASE-1", "pat@example.com");
    const s = await access.requestCode(token); if (!s.ok) throw new Error("x");
    const v = await access.verifyCode(token, s.code); if (!v.ok) throw new Error("x");
    minutes(cfg.session_minutes + 1);
    expect(await access.sessionCase(v.session)).toBeNull();
  });

  it("revoking a case removes its links and sessions", async () => {
    const { access } = setup();
    const { token } = await access.issueLink("CASE-1", "pat@example.com");
    const s = await access.requestCode(token); if (!s.ok) throw new Error("x");
    const v = await access.verifyCode(token, s.code); if (!v.ok) throw new Error("x");
    await access.revokeCase("CASE-1");
    expect(await access.sessionCase(v.session)).toBeNull();
    expect((await access.requestCode(token)).ok).toBe(false);
  });

  it("refuses a bad address and a bad config", async () => {
    const { access } = setup();
    await expect(access.issueLink("CASE-1", "not an address")).rejects.toThrow(/address/);
    expect(() => loadAccessConfig("/nonexistent.json")).toThrow();
  });
});
