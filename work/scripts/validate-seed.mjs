#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { validatePublicationRun } from "../worker/publication.mjs";

async function main() {
  const payload = JSON.parse(
    await readFile(new URL("../data/seed-run.json", import.meta.url), "utf8"),
  );
  const validated = validatePublicationRun(payload);
  process.stdout.write(
    `Embedded run is valid (${validated.mix.executive}/${validated.mix.technical}/${validated.mix.research}).\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
