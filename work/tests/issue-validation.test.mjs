import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateIssue } from "../scripts/validate-issue.mjs";

async function demonstrationIssue() {
  return JSON.parse(
    await readFile(new URL("../data/issue.json", import.meta.url), "utf8"),
  );
}

test("accepts the complete demonstration issue", async () => {
  const issue = await demonstrationIssue();
  assert.equal(validateIssue(issue), issue);
});

test("requires source links when an issue is published", async () => {
  const issue = await demonstrationIssue();
  issue.status = "Published";

  assert.throws(
    () => validateIssue(issue),
    /published story signal-over-volume needs a source URL/,
  );
});

test("rejects duplicate story identifiers", async () => {
  const issue = await demonstrationIssue();
  issue.sections[1].stories[0].id = issue.sections[0].stories[0].id;

  assert.throws(
    () => validateIssue(issue),
    /duplicate story id: signal-over-volume/,
  );
});
