import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../../..");
const TYPST = join(ROOT, ".tools/typst/typst");
const FONTS = join(ROOT, "assets/fonts");

/** A fixed creation time so the same inputs give the same bytes. Callers may pass the release time instead. */
export const DEFAULT_CREATED_AT = 1704067200;

export interface CompileInput {
  /** Typst source. Fixed templates only; case material goes in `files`, never into this text. */
  template: string;
  /** Data and source documents, as files in the work folder (for example plan.json, source.pdf). */
  files: Record<string, string | Uint8Array>;
  timeoutMs?: number;
  createdAt?: number;
}

export type CompileResult =
  | { ok: true; pdf: Uint8Array }
  | { ok: false; reason: "typst_missing" | "invalid_file_name" | "package_import_refused" | "timeout" | "typst_error" | "warning" | "no_output"; diagnostics: string };

const safeName = (n: string) => n.length > 0 && !n.startsWith("/") && !n.includes("\\") && !n.includes("\0") && !n.split("/").some((p) => p === ".." || p === "" || p === ".");

function run(args: string[], cwd: string, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((done) => {
    // minimal environment; no shell; Typst is also never given a way to fetch packages (templates that import them are refused earlier)
    const child = spawn(TYPST, args, { cwd, env: { PATH: "/usr/bin:/bin" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d)); child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => { clearTimeout(timer); done({ code: -1, stdout, stderr: String(e), timedOut }); });
    child.on("close", (code) => { clearTimeout(timer); done({ code, stdout, stderr, timedOut }); });
  });
}

/**
 * Compiles a template with the pinned Typst program: only the bundled fonts are visible, a fixed creation time is set,
 * and the work happens in a throwaway folder. Fails closed: any warning (Typst swaps a missing font silently and exits 0),
 * non-zero exit, or timeout means no PDF.
 */
export async function compileTypst(input: CompileInput): Promise<CompileResult> {
  if (!existsSync(TYPST)) return { ok: false, reason: "typst_missing", diagnostics: "Typst is not installed. Run: npm run setup:typst" };
  for (const name of Object.keys(input.files)) if (!safeName(name)) return { ok: false, reason: "invalid_file_name", diagnostics: `Refused file name: ${JSON.stringify(name)}` };
  if (/@(?:preview|local)\//.test(input.template)) return { ok: false, reason: "package_import_refused", diagnostics: "Outside Typst packages are not allowed" };

  const dir = await mkdtemp(join(tmpdir(), "typst-"));
  try {
    await writeFile(join(dir, "main.typ"), input.template);
    for (const [name, content] of Object.entries(input.files)) {
      await mkdir(dirname(join(dir, name)), { recursive: true });
      await writeFile(join(dir, name), content);
    }
    const r = await run(
      ["compile", "--ignore-system-fonts", "--font-path", FONTS, "--creation-timestamp", String(input.createdAt ?? DEFAULT_CREATED_AT), "--root", dir, "--diagnostic-format", "short", "main.typ", "out.pdf"],
      dir, input.timeoutMs ?? 60_000,
    );
    if (r.timedOut) return { ok: false, reason: "timeout", diagnostics: "The build took too long and was stopped" };
    const diagnostics = (r.stderr + r.stdout).trim();
    if (r.code !== 0) return { ok: false, reason: "typst_error", diagnostics };
    if (/warning/i.test(diagnostics)) return { ok: false, reason: "warning", diagnostics };
    const out = join(dir, "out.pdf");
    if (!existsSync(out)) return { ok: false, reason: "no_output", diagnostics };
    return { ok: true, pdf: new Uint8Array(await readFile(out)) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Font families Typst can see (our bundled folder only). */
export async function typstFonts(): Promise<string[]> {
  const r = await run(["fonts", "--ignore-system-fonts", "--font-path", FONTS], ROOT, 30_000);
  return r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
}
