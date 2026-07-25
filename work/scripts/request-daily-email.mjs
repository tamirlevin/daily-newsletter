#!/usr/bin/env node

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

function configuration() {
  const rawUrl = process.env.SITES_INGEST_URL?.trim();
  const token = process.env.SITES_INGEST_TOKEN?.trim();
  if (!rawUrl) throw new Error("SITES_INGEST_URL is not configured");
  if (!token || token.length < 32) {
    throw new Error("SITES_INGEST_TOKEN is not configured");
  }

  const ingestUrl = new URL(rawUrl);
  if (
    ingestUrl.protocol !== "https:" ||
    ingestUrl.pathname !== "/api/ingest"
  ) {
    throw new Error(
      "SITES_INGEST_URL must be an HTTPS URL ending in /api/ingest",
    );
  }
  return {
    url: new URL("/api/email-deliveries", ingestUrl.origin),
    token,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const runId = String(options.runId ?? "").trim();
  if (!runId.startsWith("daily:")) {
    throw new Error("--run-id must identify an accepted Daily run");
  }
  const { url, token } = configuration();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ runId }),
    signal: AbortSignal.timeout(45_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.delivered !== true) {
    throw new Error(
      typeof result.error === "string"
        ? `Email delivery failed: ${result.error}`
        : `Email delivery failed with status ${response.status}`,
    );
  }

  process.stdout.write(
    `Daily email ${result.disposition} for ${runId}.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
