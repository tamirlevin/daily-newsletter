#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectBrief } from "../lib/collector/pipeline.mjs";

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

async function writeJsonAtomic(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, targetPath);
}

function outputStamp(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const configPath = path.resolve(
    projectRoot,
    options.config ?? "config/editorial.json",
  );
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const asOf = options.asOf ? new Date(options.asOf) : new Date();
  const lookbackDays =
    options.lookbackDays === undefined
      ? config.lookbackDays
      : Number(options.lookbackDays);
  const maxItems =
    options.maxItems === undefined ? config.maxItems : Number(options.maxItems);

  if (!Number.isFinite(lookbackDays) || lookbackDays <= 0) {
    throw new Error("--lookback-days must be a positive number");
  }
  if (!Number.isInteger(maxItems) || maxItems <= 0) {
    throw new Error("--max-items must be a positive integer");
  }

  const { draft, healthReport } = await collectBrief({
    config,
    asOf,
    lookbackDays,
    maxItems,
  });
  const stamp = outputStamp(asOf);
  const draftPath = path.resolve(
    projectRoot,
    options.draftDir ?? "data/drafts",
    `${stamp}.json`,
  );
  const healthPath = path.resolve(
    projectRoot,
    options.healthDir ?? "data/source-health",
    `${stamp}.json`,
  );

  await writeJsonAtomic(draftPath, draft);
  await writeJsonAtomic(healthPath, healthReport);

  process.stdout.write(
    [
      `Draft: ${path.relative(projectRoot, draftPath)}`,
      `Health: ${path.relative(projectRoot, healthPath)}`,
      `Candidates: ${draft.items.length}`,
      `Mix: ${Object.entries(draft.editorialPolicy.selectedMix)
        .map(([lane, count]) => `${lane}=${count}`)
        .join(", ")}`,
      `Sources: ${healthReport.status}`,
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
