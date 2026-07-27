import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BRIEFING_PROFILES } from "../lib/briefing-profiles.mjs";
import {
  EXPECTED_MIX_BY_CADENCE,
  preparePublishedRun,
  RETAINED_RUNS_BY_CADENCE,
  validatePublicationRun,
} from "../worker/publication.mjs";

async function seedRun(cadence = "weekly") {
  const name =
    cadence === "daily" ? "seed-daily-run.json" : "seed-run.json";
  return JSON.parse(
    await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"),
  );
}

test("accepts complete Daily and Weekly cadence profiles", async () => {
  const daily = await seedRun("daily");
  const weekly = await seedRun("weekly");

  const dailyResult = validatePublicationRun(daily);
  assert.equal(dailyResult.runId, `daily:${daily.issueDate}`);
  assert.deepEqual(
    dailyResult.mix,
    EXPECTED_MIX_BY_CADENCE.daily,
  );
  assert.equal(dailyResult.retainedRuns, 7);
  assert.equal(dailyResult.emailEligible, true);

  const weeklyResult = validatePublicationRun(weekly);
  assert.equal(weeklyResult.runId, `weekly:${weekly.issueDate}`);
  assert.deepEqual(
    weeklyResult.mix,
    EXPECTED_MIX_BY_CADENCE.weekly,
  );
  assert.equal(weeklyResult.retainedRuns, 3);
  assert.equal(weeklyResult.emailEligible, false);
  assert.deepEqual(RETAINED_RUNS_BY_CADENCE, {
    daily: 7,
    weekly: 3,
  });
});

test("collector configuration matches the publication profiles", async () => {
  const config = JSON.parse(
    await readFile(
      new URL("../config/editorial.json", import.meta.url),
      "utf8",
    ),
  );

  for (const cadence of ["daily", "weekly"]) {
    assert.deepEqual(
      config.cadences[cadence].expectedMix,
      BRIEFING_PROFILES[cadence].expectedMix,
    );
    assert.equal(
      config.cadences[cadence].maxItems,
      BRIEFING_PROFILES[cadence].maxItems,
    );
    assert.equal(
      config.cadences[cadence].retainedRuns,
      BRIEFING_PROFILES[cadence].retainedRuns,
    );
  }
});

test("marks an accepted run as automatically published", async () => {
  const run = await seedRun("daily");
  const result = preparePublishedRun(
    run,
    "2026-07-23T06:00:00.000Z",
  );

  assert.equal(result.payload.status, "published");
  assert.deepEqual(result.payload.publication, {
    method: "automatic",
    publishedAt: "2026-07-23T06:00:00.000Z",
  });
  assert.equal(run.status, "ready-to-publish");
});

test("rejects an incomplete run without changing the source object", async () => {
  const run = await seedRun("daily");
  run.items.pop();

  assert.throws(
    () => validatePublicationRun(run),
    /exactly 5 stories/,
  );
  assert.equal(run.items.length, 4);
});

test("rejects a mismatched stable run id", async () => {
  const run = await seedRun("daily");
  run.runId = `weekly:${run.issueDate}`;

  assert.throws(
    () => validatePublicationRun(run),
    /runId must be daily:/,
  );
});

test("rejects duplicate links and evidence-review flags", async () => {
  const duplicateRun = await seedRun("weekly");
  duplicateRun.items[1].url = duplicateRun.items[0].url;
  assert.throws(
    () => validatePublicationRun(duplicateRun),
    /Duplicate story URL/,
  );

  const evidenceRun = await seedRun("weekly");
  evidenceRun.items[0].flags.needsPrimaryEvidenceReview = true;
  assert.throws(
    () => validatePublicationRun(evidenceRun),
    /missing sufficient evidence/,
  );
});

test("accepts an explicit link-only story but rejects unsafe summary states", async () => {
  const unavailable = await seedRun("daily");
  delete unavailable.items[0].briefSummary;
  unavailable.items[0].summaryStatus = "unavailable";
  assert.deepEqual(validatePublicationRun(unavailable).summaryCoverage, {
    generated: 4,
    unavailable: 1,
  });

  const missing = await seedRun("daily");
  delete missing.items[0].briefSummary;
  assert.throws(
    () => validatePublicationRun(missing),
    /briefSummary must be a non-empty string/,
  );

  const markup = await seedRun("daily");
  markup.items[0].briefSummary =
    "This summary contains an unsafe <strong>markup fragment</strong> while continuing with enough neutral explanatory words to fall inside the accepted publication length. It should still be rejected because reader and email summaries are plain text only.";
  assert.throws(
    () => validatePublicationRun(markup),
    /plain text/,
  );

  const status = await seedRun("daily");
  status.items[0].summaryStatus = "not-generated";
  assert.throws(
    () => validatePublicationRun(status),
    /summaryStatus must be generated or unavailable/,
  );

  const unvalidated = await seedRun("daily");
  unvalidated.items[0].summaryStatus = "unavailable";
  assert.throws(
    () => validatePublicationRun(unvalidated),
    /briefSummary must be omitted when unavailable/,
  );
});

test("rejects a run when too few sources are healthy", async () => {
  const run = await seedRun("weekly");
  run.sourceHealth.healthySources = 3;

  assert.throws(
    () => validatePublicationRun(run),
    /At least 5 sources/,
  );
});

test("migration separates cadence history and creates the delivery ledger", async () => {
  const migration = await readFile(
    new URL("../drizzle/0001_bored_apocalypse.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE `email_deliveries`/);
  assert.match(migration, /ADD `cadence` text DEFAULT 'weekly'/);
  assert.match(migration, /DELETE FROM `brief_runs`/);
  assert.match(
    migration,
    /`run_id` = `cadence` \|\| ':' \|\| `issue_date`/,
  );
  assert.match(
    migration,
    /brief_runs_cadence_issue_date_uidx/,
  );
});
