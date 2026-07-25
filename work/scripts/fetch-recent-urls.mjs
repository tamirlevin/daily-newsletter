#!/usr/bin/env node

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

function runsUrl(cadence) {
  const rawUrl = process.env.SITES_INGEST_URL?.trim();
  if (!rawUrl) throw new Error("SITES_INGEST_URL is not configured");
  const ingestUrl = new URL(rawUrl);
  if (
    ingestUrl.protocol !== "https:" ||
    ingestUrl.pathname !== "/api/ingest"
  ) {
    throw new Error(
      "SITES_INGEST_URL must be an HTTPS URL ending in /api/ingest",
    );
  }
  const url = new URL("/api/runs", ingestUrl.origin);
  url.searchParams.set("cadence", cadence);
  return url;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const cadence = normalizeCadence(options.cadence, "daily");
  const response = await fetch(runsUrl(cadence), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `Recent ${cadence} history request failed with status ${response.status}`,
    );
  }
  const result = await response.json();
  if (!Array.isArray(result.runs)) {
    throw new Error("Recent history response did not contain a runs array");
  }

  const urls = [
    ...new Set(
      result.runs.flatMap((run) =>
        Array.isArray(run.items)
          ? run.items.flatMap((item) => {
              const url = item.canonicalUrl ?? item.url;
              return typeof url === "string" ? [url] : [];
            })
          : [],
      ),
    ),
  ].sort();

  const targetPath = path.resolve(
    projectRoot,
    options.output ?? path.join("data/recent", `${cadence}.json`),
  );
  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(urls, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, targetPath);
  process.stdout.write(
    `Excluded ${urls.length} URLs from recent ${cadence} runs.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
