#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePublicationRun } from "../worker/publication.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function latestRunPath() {
  const directory = path.resolve(projectRoot, "data/drafts");
  const files = (await readdir(directory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const latest = files.at(-1);
  if (!latest) throw new Error("No completed collector run was found");
  return path.join(directory, latest);
}

function publishingConfig() {
  const rawUrl = process.env.SITES_INGEST_URL?.trim();
  const token = process.env.SITES_INGEST_TOKEN?.trim();
  if (!rawUrl) throw new Error("SITES_INGEST_URL is not configured");
  if (!token || token.length < 32) {
    throw new Error("SITES_INGEST_TOKEN is not configured");
  }

  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.pathname !== "/api/ingest") {
    throw new Error(
      "SITES_INGEST_URL must be an HTTPS URL ending in /api/ingest",
    );
  }
  return { url, token };
}

async function main() {
  const runPath = await latestRunPath();
  const payload = JSON.parse(await readFile(runPath, "utf8"));
  const validated = validatePublicationRun(payload);
  const { url, token } = publishingConfig();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? `Publication rejected: ${result.error}`
        : `Publication failed with status ${response.status}`,
    );
  }

  process.stdout.write(
    `Published ${validated.runId} with ${payload.items.length} stories.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
