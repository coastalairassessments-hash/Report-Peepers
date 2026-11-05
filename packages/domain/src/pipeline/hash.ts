import { createHash } from "node:crypto";
export const sha256Hex = (b: Uint8Array | string): string => createHash("sha256").update(b).digest("hex");
