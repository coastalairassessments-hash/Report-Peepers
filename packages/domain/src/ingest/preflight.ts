import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// Legacy build: runs in Node without browser features. Used here only to read the file structure (page count).
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Limits come from data/rules/limits.json (proposed targets, spec section 8 and D06). Never hard-code them in logic. */
export interface Limits { max_pages: number; max_documents: number; max_images: number; max_bytes_per_document: number; max_bytes_total: number }

export function loadLimits(path = resolve(import.meta.dirname, "../../../../data/rules/limits.json")): Limits {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return { max_pages: raw.max_pages, max_documents: raw.max_documents, max_images: raw.max_images, max_bytes_per_document: raw.max_bytes_per_document, max_bytes_total: raw.max_bytes_total };
}

export type Flag = "has_javascript" | "has_launch_action" | "has_embedded_files";
export type PreflightReason = "empty" | "not_a_pdf" | "zip_or_office_container" | "executable" | "encrypted" | "too_large" | "too_many_pages" | "unreadable";
export type PreflightResult =
  | { ok: true; content_sha256: string; byte_size: number; page_count: number; flags: Flag[] }
  | { ok: false; reason: PreflightReason };

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);
const latin1 = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("latin1");

/**
 * Decides whether a file may be read at all (spec section 8). The file's own bytes decide, never its name.
 * Nothing in the file is run: scripts, launch actions, and embedded files are only noticed and flagged.
 */
export async function preflight(bytes: Uint8Array, _name: string, limits: Limits): Promise<PreflightResult> {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > limits.max_bytes_per_document) return { ok: false, reason: "too_large" };

  // containers and programs first: a ZIP or program that also carries a PDF header is still refused
  if (startsWith(bytes, [0x50, 0x4b]) || startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return { ok: false, reason: "zip_or_office_container" };
  if (startsWith(bytes, [0x4d, 0x5a]) || startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46]) || startsWith(bytes, [0x23, 0x21]) ||
      startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(bytes, [0xce, 0xfa, 0xed, 0xfe]) || startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe])) return { ok: false, reason: "executable" };

  const text = latin1(bytes);
  if (!text.slice(0, 1024).includes("%PDF-")) return { ok: false, reason: "not_a_pdf" };
  if (/\/Encrypt\b/.test(text)) return { ok: false, reason: "encrypted" };

  const flags: Flag[] = [];
  if (/\/(?:JavaScript|JS)\b/.test(text)) flags.push("has_javascript");
  if (/\/Launch\b/.test(text)) flags.push("has_launch_action");
  if (/\/(?:EmbeddedFile|EmbeddedFiles)\b/.test(text)) flags.push("has_embedded_files");

  let pages: number;
  try {
    const task = getDocument({ data: bytes.slice(), enableXfa: false, useWorkerFetch: false, disableFontFace: true, verbosity: 0 });
    const doc = await task.promise;
    pages = doc.numPages;
    await task.destroy();
  } catch (e) {
    return { ok: false, reason: (e as { name?: string }).name === "PasswordException" ? "encrypted" : "unreadable" };
  }
  if (pages < 1) return { ok: false, reason: "unreadable" };
  if (pages > limits.max_pages) return { ok: false, reason: "too_many_pages" };

  return { ok: true, content_sha256: createHash("sha256").update(bytes).digest("hex"), byte_size: bytes.length, page_count: pages, flags };
}
