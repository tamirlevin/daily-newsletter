import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildImportSql,
  isValidDateKey,
  loadImportInputs,
  parseArguments,
  validateRuns,
} from "../scripts/import-public-history.mjs";

function run(cadence, issueDate) {
  return {
    schemaVersion: 3,
    kind: "collection-draft",
    cadence,
    runId: `${cadence}:${issueDate}`,
    issueDate,
    generatedAt: `${issueDate}T05:00:00.000Z`,
    status: "published",
    publication: { publishedAt: `${issueDate}T05:01:00.000Z` },
    items: [{ title: "Fixture", url: "https://example.com/story", editorialLane: "executive" }],
  };
}

test("combined --file imports the named snapshot without fetching", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "public-history-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "snapshot.json");
  await writeFile(
    file,
    JSON.stringify({
      daily: [run("daily", "2026-11-18")],
      weekly: [run("weekly", "2026-11-13")],
    }),
  );

  let fetchCalls = 0;
  const result = await loadImportInputs({
    file,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("combined file must not fetch");
    },
  });

  assert.equal(fetchCalls, 0);
  assert.equal(result.daily.length, 1);
  assert.equal(result.weekly.length, 1);
  await rm(directory, { recursive: true, force: true });
});

test("rejects malformed dates, mismatched IDs, duplicates, and unpublished runs", () => {
  assert.equal(isValidDateKey("2026-02-30"), false);
  assert.equal(isValidDateKey("2026-11-18"), true);
  assert.throws(
    () => validateRuns([{ ...run("daily", "2026-11-18"), runId: "daily:2026-11-17" }], "daily"),
    /mismatched runId/,
  );
  assert.throws(
    () => validateRuns([run("daily", "2026-11-18"), run("daily", "2026-11-18")], "daily"),
    /duplicate runIds/,
  );
  assert.throws(
    () => validateRuns([{ ...run("daily", "2026-11-18"), status: "ready-to-publish" }], "daily"),
    /unpublished run/,
  );
  assert.throws(
    () => validateRuns([{ ...run("daily", "2026-11-18"), items: [null] }], "daily"),
    /invalid item/,
  );
  assert.throws(
    () => validateRuns([{ ...run("daily", "2026-11-18"), items: [{ title: "Fixture", url: "https://example.com/story" }] }], "daily"),
    /invalid editorial lane/,
  );
  assert.throws(
    () => validateRuns([{ ...run("daily", "2026-11-18"), items: [{ title: "Fixture", url: "https://example.com/story", editorialLane: "unknown" }] }], "daily"),
    /invalid editorial lane/,
  );
});

test("rejects values for the remote --apply flag", () => {
  assert.equal(parseArguments(["--apply"]).apply, true);
  assert.throws(() => parseArguments(["--apply=false"]), /does not take a value/);
  assert.throws(() => parseArguments(["--apply", "false"]), /does not take a value/);
});

test("builds idempotent reader-history SQL with legacy hashes", () => {
  const sql = buildImportSql(
    [run("daily", "2026-11-18")],
    [run("weekly", "2026-11-13")],
  );
  assert.match(sql, /legacy:daily:2026-11-18/);
  assert.match(sql, /legacy:weekly:2026-11-13/);
  assert.equal((sql.match(/ON CONFLICT\(run_id\) DO NOTHING/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /BEGIN TRANSACTION|COMMIT/);
});
