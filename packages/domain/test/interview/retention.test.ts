import { describe, it, expect } from "vitest";
import { purgeExpired } from "../../src/pipeline/retention.js";
import { InMemoryInterviewStore, emptyState } from "../../src/interview/flow.js";
import { reviewReady } from "../pipeline/slice-fixtures.js";
import { releaseAutomatically } from "../../src/pipeline/autoRelease.js";

describe("interview answers go with the case", () => {
  it("are deleted when the case is purged, and kept while it lives", async () => {
    const { svc, id } = await reviewReady();
    const store = new InMemoryInterviewStore();
    svc.interviews = store;
    await store.save(id, emptyState());
    await releaseAutomatically(svc, id);
    const day = 86_400_000;
    const t0 = Date.parse(svc.now());
    await purgeExpired(svc, { days: 90, now: new Date(t0 + 30 * day).toISOString() });
    expect(await store.get(id)).not.toBeNull();
    expect((await purgeExpired(svc, { days: 90, now: new Date(t0 + 91 * day).toISOString() })).purged).toBe(1);
    expect(await store.get(id)).toBeNull();
  });
});
