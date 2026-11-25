#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const DEFAULT_SOURCE = "https://ai-weekly-brief.tamir-levin.chatgpt.site";
const RETENTION = { daily: 7, weekly: 3 };
const EDITORIAL_LANES = new Set(["executive", "technical", "builder", "research"]);

export function parseArguments(argv) {
  const options = {};
  const allowed = new Set([
    "file",
    "dailyFile",
    "weeklyFile",
    "source",
    "output",
    "apply",
    "database",
    "config",
    "expectDaily",
    "expectWeekly",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const [rawKey, inlineValue] = argument.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) =>
      letter.toLocaleUpperCase(),
    );
    if (!allowed.has(key)) {
      throw new Error(`Unknown option: --${rawKey}`);
    }
    if (key === "apply") {
      if (
        inlineValue !== undefined ||
        (argv[index + 1] && !argv[index + 1].startsWith("--"))
      ) {
        throw new Error("--apply does not take a value");
      }
      options.apply = true;
      continue;
    }
    const value =
      inlineValue ??
      (argv[index + 1] && !argv[index + 1].startsWith("--")
        ? argv[++index]
        : true);
    options[key] = value;
  }
  return options;
}

export function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function isValidTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function validateRuns(runs, cadence) {
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error(`Public ${cadence} history must contain at least one run`);
  }
  if (runs.length > RETENTION[cadence]) {
    throw new Error(
      `Public ${cadence} history exceeds the retained limit of ${RETENTION[cadence]}`,
    );
  }

  const ids = new Set();
  for (const run of runs) {
    if (run?.cadence !== cadence) {
      throw new Error(`Public ${cadence} history contains a mismatched cadence`);
    }
    if (!isValidDateKey(run.issueDate)) {
      throw new Error(`Public ${cadence} history contains an invalid issue date`);
    }
    if (run.runId !== `${cadence}:${run.issueDate}`) {
      throw new Error(`Public ${cadence} history contains a mismatched runId`);
    }
    if (ids.has(run.runId)) {
      throw new Error(`Public ${cadence} history contains duplicate runIds`);
    }
    ids.add(run.runId);
    if (!isValidTimestamp(run.generatedAt)) {
      throw new Error(`Public ${cadence} history contains an invalid generatedAt`);
    }
    if (
      run.publication?.publishedAt !== undefined &&
      !isValidTimestamp(run.publication.publishedAt)
    ) {
      throw new Error(`Public ${cadence} history contains an invalid publishedAt`);
    }
    if (run.status !== "published") {
      throw new Error(`Public ${cadence} history contains an unpublished run`);
    }
    if (!Array.isArray(run.items) || run.items.length === 0) {
      throw new Error(`Public ${cadence} history contains a run without items`);
    }
    for (const item of run.items) {
      if (!item || typeof item !== "object") {
        throw new Error(`Public ${cadence} history contains an invalid item`);
      }
      if (typeof item.title !== "string" || !item.title.trim()) {
        throw new Error(`Public ${cadence} history contains an item without a title`);
      }
      if (!EDITORIAL_LANES.has(item.editorialLane)) {
        throw new Error(`Public ${cadence} history contains an invalid editorial lane`);
      }
      try {
        const url = new URL(item.url);
        if (url.protocol !== "https:") throw new Error("not HTTPS");
      } catch {
        throw new Error(`Public ${cadence} history contains an invalid item URL`);
      }
    }
  }

  return runs;
}

async function readJson(file) {
  return JSON.parse(await readFile(path.resolve(projectRoot, file), "utf8"));
}

async function fetchRuns(source, cadence, fetchImpl) {
  const response = await fetchImpl(`${source}/api/runs?cadence=${cadence}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `Public ${cadence} history request failed with status ${response.status}`,
    );
  }
  return response.json();
}

export async function loadImportInputs({
  file,
  dailyFile,
  weeklyFile,
  source = DEFAULT_SOURCE,
  fetchImpl = globalThis.fetch,
}) {
  const hasCombined = Boolean(file);
  const hasSeparate = Boolean(dailyFile || weeklyFile);
  if (hasCombined && hasSeparate) {
    throw new Error("Use either --file or --daily-file/--weekly-file, not both");
  }

  if (hasCombined) {
    const snapshot = await readJson(file);
    return {
      daily: validateRuns(snapshot.daily, "daily"),
      weekly: validateRuns(snapshot.weekly, "weekly"),
    };
  }

  if (hasSeparate) {
    if (!dailyFile || !weeklyFile) {
      throw new Error("Separate imports require both --daily-file and --weekly-file");
    }
    const [dailySnapshot, weeklySnapshot] = await Promise.all([
      readJson(dailyFile),
      readJson(weeklyFile),
    ]);
    return {
      daily: validateRuns(
        Array.isArray(dailySnapshot) ? dailySnapshot : dailySnapshot.runs,
        "daily",
      ),
      weekly: validateRuns(
        Array.isArray(weeklySnapshot) ? weeklySnapshot : weeklySnapshot.runs,
        "weekly",
      ),
    };
  }

  const [dailyResult, weeklyResult] = await Promise.all([
    fetchRuns(source, "daily", fetchImpl),
    fetchRuns(source, "weekly", fetchImpl),
  ]);
  return {
    daily: validateRuns(dailyResult.runs, "daily"),
    weekly: validateRuns(weeklyResult.runs, "weekly"),
  };
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insertRun(run) {
  const publishedAt = run.publication?.publishedAt ?? run.generatedAt;
  const sourceHealth = run.sourceHealth?.status ?? "degraded";
  const payload = JSON.stringify(run);

  return `INSERT INTO brief_runs (
  run_id,
  cadence,
  issue_date,
  generated_at,
  published_at,
  updated_at,
  source_health,
  payload_hash,
  payload
) VALUES (
  ${sqlString(run.runId)},
  ${sqlString(run.cadence)},
  ${sqlString(run.issueDate)},
  ${sqlString(run.generatedAt)},
  ${sqlString(publishedAt)},
  ${sqlString(publishedAt)},
  ${sqlString(sourceHealth)},
  ${sqlString(`legacy:${run.runId}`)},
  ${sqlString(payload)}
) ON CONFLICT(run_id) DO NOTHING;`;
}

export function buildImportSql(daily, weekly) {
  return [...daily.map(insertRun), ...weekly.map(insertRun), ""].join("\n");
}

function expectedCount(value, name) {
  if (value === undefined) return undefined;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return count;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const source = String(options.source ?? DEFAULT_SOURCE).replace(/\/$/, "");
  const output = path.resolve(
    projectRoot,
    options.output ?? path.join("data/import/public-history.sql"),
  );

  if (options.apply && !options.file && !options.dailyFile && !options.weeklyFile) {
    throw new Error("--apply requires a saved --file or both separate history files");
  }

  const { daily, weekly } = await loadImportInputs({
    file: options.file,
    dailyFile: options.dailyFile,
    weeklyFile: options.weeklyFile,
    source,
  });

  const expectedDaily = expectedCount(options.expectDaily, "--expect-daily");
  const expectedWeekly = expectedCount(options.expectWeekly, "--expect-weekly");
  if (expectedDaily !== undefined && daily.length !== expectedDaily) {
    throw new Error(`Expected ${expectedDaily} Daily runs, found ${daily.length}`);
  }
  if (expectedWeekly !== undefined && weekly.length !== expectedWeekly) {
    throw new Error(`Expected ${expectedWeekly} Weekly runs, found ${weekly.length}`);
  }

  const sql = buildImportSql(daily, weekly);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, sql, "utf8");

  process.stdout.write(
    [
      `Wrote ${path.relative(projectRoot, output)}`,
      `Daily runs: ${daily.length}`,
      `Weekly runs: ${weekly.length}`,
      "Email ledger: not imported; historical email must remain blocked by EMAIL_MIN_ISSUE_DATE.",
    ].join("\n") + "\n",
  );

  if (options.apply) {
    const database = options.database ?? "ai-weekly-brief-staging";
    const config = options.config ?? "wrangler.staging.jsonc";
    execFileSync(
      path.resolve(projectRoot, "node_modules/.bin/wrangler"),
      [
        "d1",
        "execute",
        database,
        "--remote",
        "--config",
        config,
        "--file",
        output,
      ],
      { stdio: "inherit" },
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
