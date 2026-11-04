// Installs the pinned Typst command-line program into .tools/typst after verifying its checksum.
// Run: node scripts/install-typst.mjs   (also run in CI). Refuses any file that does not match the pinned SHA-256.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const VERSION = "0.14.2";
const ARCHIVE = "typst-x86_64-unknown-linux-musl.tar.xz";
const SHA256 = "a6044cbad2a954deb921167e257e120ac0a16b20339ec01121194ff9d394996d";
const URL = `https://github.com/typst/typst/releases/download/v${VERSION}/${ARCHIVE}`;

const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, ".tools/typst");
const bin = resolve(dir, "typst");

if (existsSync(bin)) {
  const v = execFileSync(bin, ["--version"], { encoding: "utf8" });
  if (v.includes(VERSION)) { console.log(`typst ${VERSION} already installed`); process.exit(0); }
}
mkdirSync(dir, { recursive: true });
const archive = resolve(dir, ARCHIVE);
execFileSync("curl", ["-fsSL", "-o", archive, URL], { stdio: "inherit" });
const got = createHash("sha256").update(readFileSync(archive)).digest("hex");
if (got !== SHA256) { rmSync(archive); console.error(`Checksum mismatch for ${ARCHIVE}: expected ${SHA256}, got ${got}`); process.exit(1); }
execFileSync("tar", ["xJf", archive, "-C", dir, "--strip-components=1"], { stdio: "inherit" });
rmSync(archive);
chmodSync(bin, 0o755);
console.log(execFileSync(bin, ["--version"], { encoding: "utf8" }).trim());
