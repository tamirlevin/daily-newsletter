import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  preparePublishedRun,
  RETAINED_RUNS,
  validatePublicationRun,
} from "../worker/publication.mjs";

async function seedRun() {
  return JSON.parse(
    await readFile(new URL("../data/seed-run.json", import.meta.url), "utf8"),
  );
}

test("accepts a complete 7/2/1 run", async () => {
  const run = await seedRun();
  const result = validatePublicationRun(run);

  assert.equal(result.runId, run.generatedAt);
  assert.deepEqual(result.mix, {
    executive: 7,
    technical: 2,
    research: 1,
  });
  assert.equal(RETAINED_RUNS, 3);
});

test("marks an accepted run as automatically published", async () => {
  const run = await seedRun();
  const result = preparePublishedRun(run, "2026-07-23T06:00:00.000Z");

  assert.equal(result.payload.status, "published");
  assert.deepEqual(result.payload.publication, {
    method: "automatic",
    publishedAt: "2026-07-23T06:00:00.000Z",
  });
  assert.equal(run.status, "ready-to-publish");
});

test("rejects an incomplete run without changing the source object", async () => {
  const run = await seedRun();
  run.items.pop();

  assert.throws(
    () => validatePublicationRun(run),
    /exactly 10 stories/,
  );
  assert.equal(run.items.length, 9);
});

test("rejects duplicate links and evidence-review flags", async () => {
  const duplicateRun = await seedRun();
  duplicateRun.items[1].url = duplicateRun.items[0].url;
  assert.throws(() => validatePublicationRun(duplicateRun), /Duplicate story URL/);

  const evidenceRun = await seedRun();
  evidenceRun.items[0].flags.needsPrimaryEvidenceReview = true;
  assert.throws(
    () => validatePublicationRun(evidenceRun),
    /missing sufficient evidence/,
  );
});

test("rejects a run when too few sources are healthy", async () => {
  const run = await seedRun();
  run.sourceHealth.healthySources = 3;

  assert.throws(() => validatePublicationRun(run), /At least 5 sources/);
});
