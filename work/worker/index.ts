import {
  preparePublishedRun,
  RETAINED_RUNS,
} from "./publication.mjs";

interface D1Result<T = unknown> {
  results?: T[];
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

interface Env {
  DB: D1Database;
  INGEST_TOKEN?: string;
}

type StoredRun = {
  run_id: string;
  issue_date: string;
  generated_at: string;
  published_at: string;
  source_health: string;
  payload: string;
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

function json(
  body: unknown,
  init: ResponseInit & { headers?: Record<string, string> } = {},
) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...init.headers,
    },
  });
}

function secretsMatch(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function authorized(request: Request, env: Env) {
  if (!env.INGEST_TOKEN) return false;
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  return secretsMatch(authorization.slice(7), env.INGEST_TOKEN);
}

async function listRuns(env: Env) {
  try {
    const result = await env.DB.prepare(
      `SELECT run_id, issue_date, generated_at, published_at, source_health, payload
       FROM brief_runs
       ORDER BY generated_at DESC
       LIMIT ?`,
    )
      .bind(RETAINED_RUNS)
      .all<StoredRun>();

    const rows = result.results ?? [];
    const runs = rows.flatMap((row) => {
      try {
        return [JSON.parse(row.payload)];
      } catch {
        return [];
      }
    });

    return json(
      {
        runs,
        retention: RETAINED_RUNS,
        updatedAt: rows[0]?.published_at ?? null,
      },
      {
        headers: {
          "cache-control": "public, max-age=60, s-maxage=300",
        },
      },
    );
  } catch {
    return json(
      {
        runs: [],
        retention: RETAINED_RUNS,
        updatedAt: null,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }
}

async function ingestRun(request: Request, env: Env) {
  if (!env.INGEST_TOKEN) {
    return json(
      { error: "Automatic publishing is not configured" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (!authorized(request, env)) {
    return json(
      { error: "Unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLocaleLowerCase()
      .includes("application/json")
  ) {
    return json(
      { error: "Content-Type must be application/json" },
      { status: 415, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const body = await request.text();
    if (body.length > 500_000) {
      return json(
        { error: "Run payload is too large" },
        { status: 413, headers: { "cache-control": "no-store" } },
      );
    }
    const publication = preparePublishedRun(JSON.parse(body));
    const payload = JSON.stringify(publication.payload);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO brief_runs (
          run_id,
          issue_date,
          generated_at,
          published_at,
          source_health,
          payload
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET
          issue_date = excluded.issue_date,
          generated_at = excluded.generated_at,
          source_health = excluded.source_health,
          payload = excluded.payload`,
      ).bind(
        publication.runId,
        publication.issueDate,
        publication.generatedAt,
        publication.publishedAt,
        publication.sourceHealth,
        payload,
      ),
      env.DB.prepare(
        `DELETE FROM brief_runs
         WHERE run_id NOT IN (
           SELECT run_id
           FROM brief_runs
           ORDER BY generated_at DESC
           LIMIT ?
         )`,
      ).bind(RETAINED_RUNS),
    ]);

    return json(
      {
        published: true,
        runId: publication.runId,
        issueDate: publication.issueDate,
        retainedRuns: RETAINED_RUNS,
      },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid publication run";
    return json(
      { error: message },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/runs") {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, { status: 405 });
      }
      return listRuns(env);
    }

    if (url.pathname === "/api/ingest") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
      }
      return ingestRun(request, env);
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "ai-weekly-brief" });
    }

    return json({ error: "Not found" }, { status: 404 });
  },
};
