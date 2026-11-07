import { extractDocument } from "./extract.js";

/**
 * Entry point for the isolated reading process: PDF bytes on stdin, one line of JSON on stdout.
 * It must be built to plain JavaScript and started with hardenedNodeArgs (see ingest/worker.ts). The build step is part of the hosting setup.
 */
export async function runWorker(read: () => Promise<Uint8Array>, write: (s: string) => void): Promise<void> {
  const doc = await extractDocument(await read());
  write(JSON.stringify(doc));
}
