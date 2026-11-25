#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRuns } from "./import-public-history.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function load(source, cadence) {
  const response = await fetch(`${source}/api/runs?cadence=${cadence}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${cadence}: ${response.status}`);
  const result = await response.json();
  return validateRuns(result.runs, cadence);
}

const source = (
  process.argv[2] ?? "https://ai-weekly-brief.tamir-levin.chatgpt.site"
).replace(/\/$/, "");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const output = path.resolve(
  projectRoot,
  process.argv[3] ?? path.join("data/import", `public-history-${stamp}.json`),
);
const out = {
  source,
  generatedAt: new Date().toISOString(),
  daily: await load(source, "daily"),
  weekly: await load(source, "weekly"),
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(`Saved ${output}`);
console.log(`Daily=${out.daily.length} Weekly=${out.weekly.length}`);
