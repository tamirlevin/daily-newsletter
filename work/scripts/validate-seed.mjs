#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { validatePublicationRun } from "../worker/publication.mjs";

async function main() {
  const payloads = await Promise.all(
    [
      "../data/seed-daily-run.json",
      "../data/seed-run.json",
    ].map(async (path) =>
      JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")),
    ),
  );
  const validated = payloads.map(validatePublicationRun);
  process.stdout.write(
    `${validated.map((run) => `Embedded ${run.cadence} run is valid (${run.mix.executive}/${run.mix.technical}/${run.mix.builder}).`).join("\n")}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
