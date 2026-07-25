#!/usr/bin/env node

import { appendFile, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePublicationRun } from "../worker/publication.mjs";
import { normalizeCadence } from "../lib/briefing-profiles.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const [rawKey, inlineValue] = argument.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) =>
      letter.toLocaleUpperCase(),
    );
    const value =
      inlineValue ??
      (argv[index + 1] && !argv[index + 1].startsWith("--")
        ? argv[++index]
        : true);
    options[key] = value;
  }
  return options;
}

async function latestRunPath(cadence) {
  const directory = path.resolve(projectRoot, "data/drafts", cadence);
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
  const options = parseArguments(process.argv.slice(2));
  const cadence = normalizeCadence(options.cadence, "weekly");
  const runPath = await latestRunPath(cadence);
  const payload = JSON.parse(await readFile(runPath, "utf8"));
  const validated = validatePublicationRun(payload);
  if (validated.cadence !== cadence) {
    throw new Error(
      `Latest draft is ${validated.cadence}, not ${cadence}`,
    );
  }
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
  if (
    result.accepted !== true ||
    result.runId !== validated.runId ||
    result.cadence !== validated.cadence
  ) {
    throw new Error("Sites did not confirm the expected accepted run");
  }

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      [
        `run_id=${validated.runId}`,
        `cadence=${validated.cadence}`,
        `disposition=${result.disposition ?? "accepted"}`,
        `email_eligible=${result.emailEligible === true}`,
        "",
      ].join("\n"),
      "utf8",
    );
  }

  process.stdout.write(
    `Accepted ${validated.runId} with ${payload.items.length} stories (${result.disposition}).\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
