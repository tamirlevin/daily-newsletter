import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import worker from "../dist/server/index.js";

class MockStatement {
  constructor(database, query) {
    this.database = database;
    this.query = query;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async all() {
    if (!this.query.includes("FROM brief_runs")) {
      throw new Error("Unsupported mock query");
    }
    const limit = this.values[0];
    return {
      results: [...this.database.rows.values()]
        .sort((left, right) =>
          right.generated_at.localeCompare(left.generated_at),
        )
        .slice(0, limit),
    };
  }

  async first() {
    return null;
  }
}

class MockD1 {
  rows = new Map();

  prepare(query) {
    return new MockStatement(this, query);
  }

  async batch(statements) {
    for (const statement of statements) {
      if (statement.query.includes("INSERT INTO brief_runs")) {
        const [
          runId,
          issueDate,
          generatedAt,
          publishedAt,
          sourceHealth,
          payload,
        ] = statement.values;
        const existing = this.rows.get(runId);
        this.rows.set(runId, {
          run_id: runId,
          issue_date: issueDate,
          generated_at: generatedAt,
          published_at: existing?.published_at ?? publishedAt,
          source_health: sourceHealth,
          payload,
        });
      } else if (statement.query.includes("DELETE FROM brief_runs")) {
        const limit = statement.values[0];
        const retained = [...this.rows.values()]
          .sort((left, right) =>
            right.generated_at.localeCompare(left.generated_at),
          )
          .slice(0, limit);
        this.rows = new Map(retained.map((row) => [row.run_id, row]));
      } else {
        throw new Error("Unsupported mock batch statement");
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

async function seedRun() {
  return JSON.parse(
    await readFile(new URL("../data/seed-run.json", import.meta.url), "utf8"),
  );
}

function ingestRequest(payload, token) {
  return new Request("https://brief.example/api/ingest", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

test("protects ingestion and retains only the latest three valid runs", async () => {
  const token = "publication-secret-that-is-long-enough";
  const env = { DB: new MockD1(), INGEST_TOKEN: token };
  const seed = await seedRun();

  const unauthorized = await worker.fetch(
    ingestRequest(seed, "not-the-right-secret"),
    env,
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(env.DB.rows.size, 0);

  for (let index = 0; index < 4; index += 1) {
    const run = structuredClone(seed);
    run.issueDate = `2026-07-${String(20 + index).padStart(2, "0")}`;
    run.generatedAt = `2026-07-${String(20 + index).padStart(2, "0")}T05:00:00.000Z`;
    run.period.end = run.generatedAt;

    const response = await worker.fetch(ingestRequest(run, token), env);
    assert.equal(response.status, 201);
  }

  assert.equal(env.DB.rows.size, 3);
  const listResponse = await worker.fetch(
    new Request("https://brief.example/api/runs"),
    env,
  );
  assert.equal(listResponse.status, 200);
  const listing = await listResponse.json();

  assert.equal(listing.retention, 3);
  assert.equal(listing.runs.length, 3);
  assert.deepEqual(
    listing.runs.map((run) => run.issueDate),
    ["2026-07-23", "2026-07-22", "2026-07-21"],
  );
  assert.equal(listing.runs[0].status, "published");
  assert.equal(listing.runs[0].publication.method, "automatic");

  const invalid = structuredClone(seed);
  invalid.generatedAt = "2026-07-24T05:00:00.000Z";
  invalid.items.pop();
  const rejected = await worker.fetch(ingestRequest(invalid, token), env);
  assert.equal(rejected.status, 400);
  assert.equal(env.DB.rows.size, 3);
});
