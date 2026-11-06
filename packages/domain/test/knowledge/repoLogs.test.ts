import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadLibrary } from "../../src/knowledge/library.js";
import { readDecisions, readEdits } from "../../src/knowledge/log.js";
import { currentVersion, statusOf } from "../../src/knowledge/status.js";

const DIR = join(__dirname, "../../../../data/knowledge");
const lib = loadLibrary();
const ids = new Set(lib.entries.map((e) => e.id));

describe("committed review logs", () => {
  it("every logged entry id exists in the library", () => {
    for (const kind of ["decisions", "edits"]) {
      const d = join(DIR, kind);
      if (!existsSync(d)) continue;
      for (const f of readdirSync(d)) expect(ids.has(f.replace(".json", ""))).toBe(true);
    }
  });
  it("every decision names a version that existed when it was made", () => {
    for (const e of lib.entries) {
      const edits = readEdits(DIR, e.id);
      const valid = new Set([e.version, ...edits.map((_, i) => `${e.version}+e${i + 1}`)]);
      for (const d of readDecisions(DIR, e.id)) expect(valid.has(d.version)).toBe(true);
    }
  });
  it("nothing is approved yet: the owner has not approved", () => {
    for (const e of lib.entries) {
      const edits = readEdits(DIR, e.id);
      const s = statusOf(e, edits, readDecisions(DIR, e.id));
      expect(s).not.toBe("approved");
      expect(currentVersion(e, edits).startsWith(e.version)).toBe(true);
    }
  });
});
