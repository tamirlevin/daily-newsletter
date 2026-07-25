import {
  preparePublishedRun,
  RETAINED_RUNS_BY_CADENCE,
} from "./publication.mjs";
import { normalizeCadence } from "../lib/briefing-profiles.mjs";
import { renderDailyEmail } from "./email.mjs";

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
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  DAILY_EMAIL_TO?: string;
  PUBLIC_BASE_URL?: string;
}

type StoredRun = {
  run_id: string;
  cadence: "daily" | "weekly";
  issue_date: string;
  generated_at: string;
  published_at: string;
  updated_at: string;
  source_health: string;
  payload_hash: string;
  payload: string;
};

type StoredDelivery = {
  delivery_key: string;
  run_id: string;
  payload_hash: string;
  status: "pending" | "sending" | "sent" | "failed";
  provider: string;
  provider_message_id: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

const RUN_COLUMNS =
  "run_id, cadence, issue_date, generated_at, published_at, updated_at, source_health, payload_hash, payload";

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

function requireAuthorization(request: Request, env: Env) {
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
  return null;
}

function requireJson(request: Request) {
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
  return null;
}

async function payloadHash(payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parsedRun(row: StoredRun | null) {
  if (!row) return null;
  try {
    const run = JSON.parse(row.payload);
    return {
      ...run,
      cadence: row.cadence,
      runId: row.run_id,
      editorialPolicy: {
        ...run.editorialPolicy,
        profile: row.cadence,
      },
    };
  } catch {
    return null;
  }
}

async function storedRun(env: Env, runId: string) {
  return env.DB.prepare(
    `SELECT ${RUN_COLUMNS}
     FROM brief_runs
     WHERE run_id = ?`,
  )
    .bind(runId)
    .first<StoredRun>();
}

async function storedDelivery(env: Env, runId: string) {
  return env.DB.prepare(
    `SELECT delivery_key, run_id, payload_hash, status, provider,
            provider_message_id, attempt_count, last_attempt_at, sent_at,
            last_error, created_at, updated_at
     FROM email_deliveries
     WHERE run_id = ?`,
  )
    .bind(runId)
    .first<StoredDelivery>();
}

async function listRuns(request: Request, env: Env) {
  const url = new URL(request.url);
  let cadence: "daily" | "weekly";
  try {
    cadence = normalizeCadence(url.searchParams.get("cadence"), "weekly");
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Invalid cadence" },
      { status: 400 },
    );
  }
  const retention = RETAINED_RUNS_BY_CADENCE[cadence];

  try {
    const result = await env.DB.prepare(
      `SELECT ${RUN_COLUMNS}
       FROM brief_runs
       WHERE cadence = ?
       ORDER BY issue_date DESC, generated_at DESC
       LIMIT ?`,
    )
      .bind(cadence, retention)
      .all<StoredRun>();

    const rows = result.results ?? [];
    const runs = rows.flatMap((row) => {
      const run = parsedRun(row);
      return run ? [run] : [];
    });

    return json(
      {
        cadence,
        runs,
        retention,
        updatedAt: rows[0]?.updated_at ?? rows[0]?.published_at ?? null,
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
        cadence,
        runs: [],
        retention,
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

async function getRun(runId: string, env: Env) {
  try {
    const row = await storedRun(env, runId);
    const run = parsedRun(row);
    if (!run) return json({ error: "Run not found" }, { status: 404 });
    return json(
      { run },
      {
        headers: {
          "cache-control": "public, max-age=60, s-maxage=300",
        },
      },
    );
  } catch {
    return json({ error: "Run unavailable" }, { status: 503 });
  }
}

async function ingestRun(request: Request, env: Env) {
  const authorizationError = requireAuthorization(request, env);
  if (authorizationError) return authorizationError;
  const contentTypeError = requireJson(request);
  if (contentTypeError) return contentTypeError;

  try {
    const body = await request.text();
    if (body.length > 500_000) {
      return json(
        { error: "Run payload is too large" },
        { status: 413, headers: { "cache-control": "no-store" } },
      );
    }

    const sourcePayload = JSON.parse(body);
    const publication = preparePublishedRun(sourcePayload);
    const sourceHash = await payloadHash(sourcePayload);
    const existing = await storedRun(env, publication.runId);

    if (existing?.payload_hash === sourceHash) {
      return json(
        {
          accepted: true,
          disposition: "unchanged",
          runId: publication.runId,
          cadence: publication.cadence,
          issueDate: publication.issueDate,
          retainedRuns: publication.retainedRuns,
          emailEligible: publication.emailEligible,
        },
        { status: 200, headers: { "cache-control": "no-store" } },
      );
    }

    if (existing && publication.cadence === "daily") {
      const delivery = await storedDelivery(env, publication.runId);
      if (delivery?.status === "sent" || delivery?.status === "sending") {
        return json(
          {
            error:
              "This Daily issue is already being delivered or has been sent",
          },
          { status: 409, headers: { "cache-control": "no-store" } },
        );
      }
    }

    const now = new Date().toISOString();
    const publishedAt = existing?.published_at ?? publication.publishedAt;
    publication.payload.publication.publishedAt = publishedAt;
    const payload = JSON.stringify(publication.payload);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO brief_runs (
          run_id,
          cadence,
          issue_date,
          generated_at,
          published_at,
          updated_at,
          source_health,
          payload_hash,
          payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET
          cadence = excluded.cadence,
          issue_date = excluded.issue_date,
          generated_at = excluded.generated_at,
          updated_at = excluded.updated_at,
          source_health = excluded.source_health,
          payload_hash = excluded.payload_hash,
          payload = excluded.payload`,
      ).bind(
        publication.runId,
        publication.cadence,
        publication.issueDate,
        publication.generatedAt,
        publishedAt,
        now,
        publication.sourceHealth,
        sourceHash,
        payload,
      ),
      env.DB.prepare(
        `DELETE FROM brief_runs
         WHERE cadence = ?
           AND run_id NOT IN (
             SELECT run_id
             FROM brief_runs
             WHERE cadence = ?
             ORDER BY issue_date DESC, generated_at DESC
             LIMIT ?
           )`,
      ).bind(
        publication.cadence,
        publication.cadence,
        publication.retainedRuns,
      ),
    ]);

    return json(
      {
        accepted: true,
        disposition: existing ? "updated" : "created",
        runId: publication.runId,
        cadence: publication.cadence,
        issueDate: publication.issueDate,
        retainedRuns: publication.retainedRuns,
        emailEligible: publication.emailEligible,
      },
      {
        status: existing ? 200 : 201,
        headers: { "cache-control": "no-store" },
      },
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

function emailConfiguration(env: Env) {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  const to = env.DAILY_EMAIL_TO?.trim();
  const rawBaseUrl = env.PUBLIC_BASE_URL?.trim();
  if (!apiKey || !from || !to || !rawBaseUrl) return null;
  try {
    const baseUrl = new URL(rawBaseUrl);
    if (baseUrl.protocol !== "https:") return null;
    return { apiKey, from, to, baseUrl };
  } catch {
    return null;
  }
}

function sendingWindowIsOpen(delivery: StoredDelivery) {
  if (!delivery.last_attempt_at) return false;
  const elapsed = Date.now() - new Date(delivery.last_attempt_at).valueOf();
  return Number.isFinite(elapsed) && elapsed < 24 * 60 * 60 * 1000;
}

async function markDeliveryFailure(
  env: Env,
  deliveryKey: string,
  error: string,
  definitive: boolean,
) {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE email_deliveries
       SET status = ?, last_error = ?, updated_at = ?
       WHERE delivery_key = ?`,
    ).bind(definitive ? "failed" : "sending", error.slice(0, 500), now, deliveryKey),
  ]);
}

async function deliverDailyEmail(request: Request, env: Env) {
  const authorizationError = requireAuthorization(request, env);
  if (authorizationError) return authorizationError;
  const contentTypeError = requireJson(request);
  if (contentTypeError) return contentTypeError;

  const configuration = emailConfiguration(env);
  if (!configuration) {
    return json(
      { error: "Daily email delivery is not configured" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const body = (await request.json()) as { runId?: unknown };
    const runId =
      typeof body.runId === "string" ? body.runId.trim() : "";
    if (!runId) {
      return json({ error: "runId is required" }, { status: 400 });
    }

    const row = await storedRun(env, runId);
    const run = parsedRun(row);
    if (!row || !run) {
      return json({ error: "Accepted run not found" }, { status: 404 });
    }
    if (row.cadence !== "daily" || run.cadence !== "daily") {
      return json(
        { error: "Email delivery is available only for Daily runs" },
        { status: 409 },
      );
    }

    const deliveryKey = `${runId}:primary:v1`;
    const existing = await storedDelivery(env, runId);
    if (existing?.status === "sent") {
      return json(
        {
          delivered: true,
          disposition: "already_sent",
          runId,
          sentAt: existing.sent_at,
        },
        { status: 200, headers: { "cache-control": "no-store" } },
      );
    }
    if (existing && existing.payload_hash !== row.payload_hash) {
      return json(
        { error: "Delivery payload does not match the accepted run" },
        { status: 409 },
      );
    }
    if (
      existing?.status === "sending" &&
      !sendingWindowIsOpen(existing)
    ) {
      return json(
        {
          error:
            "Delivery needs reconciliation before it can be retried safely",
        },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }

    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO email_deliveries (
          delivery_key,
          run_id,
          payload_hash,
          status,
          provider,
          attempt_count,
          last_attempt_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, 'sending', 'resend', 1, ?, ?, ?)
        ON CONFLICT(delivery_key) DO UPDATE SET
          status = 'sending',
          attempt_count = email_deliveries.attempt_count + 1,
          last_attempt_at = excluded.last_attempt_at,
          last_error = NULL,
          updated_at = excluded.updated_at`,
      ).bind(deliveryKey, runId, row.payload_hash, now, now, now),
    ]);

    const message = renderDailyEmail(
      run,
      configuration.baseUrl.toString(),
    );
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${configuration.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": deliveryKey,
        },
        body: JSON.stringify({
          from: configuration.from,
          to: [configuration.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Email provider unavailable";
      await markDeliveryFailure(env, deliveryKey, message, false);
      return json(
        { error: "Email provider response was not confirmed" },
        { status: 502, headers: { "cache-control": "no-store" } },
      );
    }

    const result = (await response.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      message?: string;
    };
    if (!response.ok || typeof result.id !== "string") {
      const providerError =
        result.message ?? result.name ?? `Provider status ${response.status}`;
      const definitive =
        response.status >= 400 &&
        response.status < 500 &&
        result.name !== "concurrent_idempotent_requests";
      await markDeliveryFailure(
        env,
        deliveryKey,
        providerError,
        definitive,
      );
      return json(
        { error: "Email delivery was rejected by the provider" },
        { status: 502, headers: { "cache-control": "no-store" } },
      );
    }

    const sentAt = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE email_deliveries
         SET status = 'sent',
             provider_message_id = ?,
             sent_at = ?,
             last_error = NULL,
             updated_at = ?
         WHERE delivery_key = ?`,
      ).bind(result.id, sentAt, sentAt, deliveryKey),
    ]);

    return json(
      {
        delivered: true,
        disposition: "sent",
        runId,
        sentAt,
      },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid delivery request";
    return json(
      { error: message },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
}

async function getDelivery(
  request: Request,
  env: Env,
  runId: string,
) {
  const authorizationError = requireAuthorization(request, env);
  if (authorizationError) return authorizationError;
  const delivery = await storedDelivery(env, runId);
  if (!delivery) {
    return json({ error: "Delivery not found" }, { status: 404 });
  }
  return json(
    {
      runId: delivery.run_id,
      status: delivery.status,
      provider: delivery.provider,
      attemptCount: delivery.attempt_count,
      lastAttemptAt: delivery.last_attempt_at,
      sentAt: delivery.sent_at,
      lastError: delivery.last_error,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/runs") {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, { status: 405 });
      }
      return listRuns(request, env);
    }

    if (url.pathname.startsWith("/api/runs/")) {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, { status: 405 });
      }
      return getRun(decodeURIComponent(url.pathname.slice(10)), env);
    }

    if (url.pathname === "/api/ingest") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
      }
      return ingestRun(request, env);
    }

    if (url.pathname === "/api/email-deliveries") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
      }
      return deliverDailyEmail(request, env);
    }

    if (url.pathname.startsWith("/api/email-deliveries/")) {
      if (request.method !== "GET") {
        return json({ error: "Method not allowed" }, { status: 405 });
      }
      return getDelivery(
        request,
        env,
        decodeURIComponent(url.pathname.slice(22)),
      );
    }

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "ai-brief",
        cadences: ["daily", "weekly"],
        emailConfigured: Boolean(emailConfiguration(env)),
      });
    }

    return json({ error: "Not found" }, { status: 404 });
  },
};
