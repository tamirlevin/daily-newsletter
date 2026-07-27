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
    if (
      this.query.includes("FROM brief_runs") &&
      this.query.includes("WHERE cadence = ?")
    ) {
      const [cadence, limit] = this.values;
      return {
        results: [...this.database.rows.values()]
          .filter((row) => row.cadence === cadence)
          .sort((left, right) =>
            right.issue_date.localeCompare(left.issue_date) ||
            right.generated_at.localeCompare(left.generated_at),
          )
          .slice(0, limit),
      };
    }
    throw new Error(`Unsupported mock all query: ${this.query}`);
  }

  async first() {
    if (
      this.query.includes("FROM brief_runs") &&
      this.query.includes("WHERE run_id = ?")
    ) {
      return this.database.rows.get(this.values[0]) ?? null;
    }
    if (
      this.query.includes("FROM email_deliveries") &&
      this.query.includes("WHERE run_id = ?")
    ) {
      return [...this.database.deliveries.values()].find(
        (delivery) => delivery.run_id === this.values[0],
      ) ?? null;
    }
    throw new Error(`Unsupported mock first query: ${this.query}`);
  }
}

class MockD1 {
  rows = new Map();
  deliveries = new Map();

  prepare(query) {
    return new MockStatement(this, query);
  }

  async batch(statements) {
    for (const statement of statements) {
      if (statement.query.includes("INSERT INTO brief_runs")) {
        const [
          runId,
          cadence,
          issueDate,
          generatedAt,
          publishedAt,
          updatedAt,
          sourceHealth,
          payloadHash,
          payload,
        ] = statement.values;
        const existing = this.rows.get(runId);
        this.rows.set(runId, {
          run_id: runId,
          cadence,
          issue_date: issueDate,
          generated_at: generatedAt,
          published_at: existing?.published_at ?? publishedAt,
          updated_at: updatedAt,
          source_health: sourceHealth,
          payload_hash: payloadHash,
          payload,
        });
      } else if (statement.query.includes("DELETE FROM brief_runs")) {
        const [cadence, , limit] = statement.values;
        const retainedIds = new Set(
          [...this.rows.values()]
            .filter((row) => row.cadence === cadence)
            .sort((left, right) =>
              right.issue_date.localeCompare(left.issue_date) ||
              right.generated_at.localeCompare(left.generated_at),
            )
            .slice(0, limit)
            .map((row) => row.run_id),
        );
        for (const [runId, row] of this.rows) {
          if (row.cadence === cadence && !retainedIds.has(runId)) {
            this.rows.delete(runId);
          }
        }
      } else if (
        statement.query.includes("INSERT INTO email_deliveries")
      ) {
        const [
          deliveryKey,
          runId,
          payloadHash,
          lastAttemptAt,
          createdAt,
          updatedAt,
        ] = statement.values;
        const existing = this.deliveries.get(deliveryKey);
        this.deliveries.set(deliveryKey, {
          delivery_key: deliveryKey,
          run_id: runId,
          payload_hash: payloadHash,
          status: "sending",
          provider: "resend",
          provider_message_id:
            existing?.provider_message_id ?? null,
          attempt_count: (existing?.attempt_count ?? 0) + 1,
          last_attempt_at: lastAttemptAt,
          sent_at: existing?.sent_at ?? null,
          last_error: null,
          created_at: existing?.created_at ?? createdAt,
          updated_at: updatedAt,
        });
      } else if (
        statement.query.includes("SET status = 'sent'")
      ) {
        const [providerMessageId, sentAt, updatedAt, deliveryKey] =
          statement.values;
        const delivery = this.deliveries.get(deliveryKey);
        this.deliveries.set(deliveryKey, {
          ...delivery,
          status: "sent",
          provider_message_id: providerMessageId,
          sent_at: sentAt,
          last_error: null,
          updated_at: updatedAt,
        });
      } else if (
        statement.query.includes("SET status = ?, last_error = ?")
      ) {
        const [status, lastError, updatedAt, deliveryKey] =
          statement.values;
        const delivery = this.deliveries.get(deliveryKey);
        this.deliveries.set(deliveryKey, {
          ...delivery,
          status,
          last_error: lastError,
          updated_at: updatedAt,
        });
      } else {
        throw new Error(`Unsupported mock batch query: ${statement.query}`);
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

async function seedRun(cadence) {
  const name =
    cadence === "daily" ? "seed-daily-run.json" : "seed-run.json";
  return JSON.parse(
    await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"),
  );
}

function datedRun(seed, issueDate) {
  const run = structuredClone(seed);
  run.issueDate = issueDate;
  run.runId = `${run.cadence}:${issueDate}`;
  run.generatedAt = `${issueDate}T05:00:00.000Z`;
  run.period.end = run.generatedAt;
  return run;
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

function deliveryRequest(runId, token) {
  return new Request("https://brief.example/api/email-deliveries", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ runId }),
  });
}

test("protects ingestion and retains Daily and Weekly histories separately", async () => {
  const token = "publication-secret-that-is-long-enough";
  const env = { DB: new MockD1(), INGEST_TOKEN: token };
  const weeklySeed = await seedRun("weekly");
  const dailySeed = await seedRun("daily");

  const unauthorized = await worker.fetch(
    ingestRequest(weeklySeed, "not-the-right-secret"),
    env,
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(env.DB.rows.size, 0);

  for (let index = 0; index < 4; index += 1) {
    const issueDate = `2026-07-${String(20 + index).padStart(2, "0")}`;
    const response = await worker.fetch(
      ingestRequest(datedRun(weeklySeed, issueDate), token),
      env,
    );
    assert.equal(response.status, 201);
  }
  for (let index = 0; index < 8; index += 1) {
    const issueDate = `2026-07-${String(10 + index).padStart(2, "0")}`;
    const response = await worker.fetch(
      ingestRequest(datedRun(dailySeed, issueDate), token),
      env,
    );
    assert.equal(response.status, 201);
  }

  assert.equal(
    [...env.DB.rows.values()].filter(
      (row) => row.cadence === "weekly",
    ).length,
    3,
  );
  assert.equal(
    [...env.DB.rows.values()].filter(
      (row) => row.cadence === "daily",
    ).length,
    7,
  );

  const weeklyResponse = await worker.fetch(
    new Request("https://brief.example/api/runs?cadence=weekly"),
    env,
  );
  const weeklyListing = await weeklyResponse.json();
  assert.equal(weeklyListing.retention, 3);
  assert.deepEqual(
    weeklyListing.runs.map((run) => run.runId),
    ["weekly:2026-07-23", "weekly:2026-07-22", "weekly:2026-07-21"],
  );

  const dailyResponse = await worker.fetch(
    new Request("https://brief.example/api/runs?cadence=daily"),
    env,
  );
  const dailyListing = await dailyResponse.json();
  assert.equal(dailyListing.retention, 7);
  assert.equal(dailyListing.runs.length, 7);
  assert.equal(dailyListing.runs[0].runId, "daily:2026-07-17");
  assert.equal(dailyListing.runs[0].publication.method, "automatic");
});

test("treats an identical ingestion retry as unchanged", async () => {
  const token = "publication-secret-that-is-long-enough";
  const env = { DB: new MockD1(), INGEST_TOKEN: token };
  const run = await seedRun("daily");

  const first = await worker.fetch(ingestRequest(run, token), env);
  assert.equal(first.status, 201);
  const retry = await worker.fetch(ingestRequest(run, token), env);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).disposition, "unchanged");
  assert.equal(env.DB.rows.size, 1);
});

test("sends one email only after a Daily run is accepted", async (t) => {
  const token = "publication-secret-that-is-long-enough";
  const env = {
    DB: new MockD1(),
    INGEST_TOKEN: token,
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "AI Brief <brief@example.com>",
    DAILY_EMAIL_TO: "reader@example.com",
    PUBLIC_BASE_URL: "https://brief.example",
  };
  const run = await seedRun("daily");
  const linkOnlyStory = run.items[1];
  const omittedSummary = linkOnlyStory.briefSummary;
  delete linkOnlyStory.briefSummary;
  linkOnlyStory.summaryStatus = "unavailable";

  const beforeAcceptance = await worker.fetch(
    deliveryRequest(run.runId, token),
    env,
  );
  assert.equal(beforeAcceptance.status, 404);

  const accepted = await worker.fetch(ingestRequest(run, token), env);
  assert.equal(accepted.status, 201);

  let providerCalls = 0;
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, init) => {
    providerCalls += 1;
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(
      init.headers["idempotency-key"],
      `${run.runId}:primary:v1`,
    );
    const message = JSON.parse(init.body);
    assert.deepEqual(message.to, ["reader@example.com"]);
    assert.match(message.subject, /AI Daily Brief/);
    assert.match(message.html, /Five AI developments worth your attention/);
    assert.match(message.html, /Google Research examines how artificial intelligence/);
    assert.match(message.html, new RegExp(linkOnlyStory.title));
    assert.doesNotMatch(message.html, new RegExp(omittedSummary));
    assert.doesNotMatch(message.html, /undefined/);
    assert.doesNotMatch(message.html, /summary unavailable/i);
    assert.doesNotMatch(message.html, />Read source/);
    assert.doesNotMatch(message.html, /Georgia,serif/);
    assert.match(message.html, /font:700 17px\/1\.3 Arial,sans-serif/);
    assert.match(message.text, /Google Research examines how artificial intelligence/);
    assert.match(message.text, new RegExp(linkOnlyStory.title));
    assert.doesNotMatch(message.text, new RegExp(omittedSummary));
    return new Response(JSON.stringify({ id: "email_123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const delivered = await worker.fetch(
    deliveryRequest(run.runId, token),
    env,
  );
  assert.equal(delivered.status, 201);
  assert.equal((await delivered.json()).disposition, "sent");

  const retry = await worker.fetch(deliveryRequest(run.runId, token), env);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).disposition, "already_sent");
  assert.equal(providerCalls, 1);

  const statusResponse = await worker.fetch(
    new Request(
      `https://brief.example/api/email-deliveries/${encodeURIComponent(run.runId)}`,
      {
        headers: { authorization: `Bearer ${token}` },
      },
    ),
    env,
  );
  assert.equal(statusResponse.status, 200);
  assert.equal((await statusResponse.json()).status, "sent");

  const changed = structuredClone(run);
  changed.items[0].title = `${changed.items[0].title} updated`;
  const rejected = await worker.fetch(ingestRequest(changed, token), env);
  assert.equal(rejected.status, 409);
});

test("never emails a Weekly run", async () => {
  const token = "publication-secret-that-is-long-enough";
  const env = {
    DB: new MockD1(),
    INGEST_TOKEN: token,
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "AI Brief <brief@example.com>",
    DAILY_EMAIL_TO: "reader@example.com",
    PUBLIC_BASE_URL: "https://brief.example",
  };
  const run = await seedRun("weekly");
  await worker.fetch(ingestRequest(run, token), env);

  const response = await worker.fetch(
    deliveryRequest(run.runId, token),
    env,
  );
  assert.equal(response.status, 409);
});
