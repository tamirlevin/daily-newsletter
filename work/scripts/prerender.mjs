#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const htmlPath = path.resolve(projectRoot, "dist/index.html");
const serverEntry = path.resolve(projectRoot, "dist-ssr/entry-server.js");

async function main() {
  const [{ render }, template] = await Promise.all([
    import(pathToFileURL(serverEntry).href),
    readFile(htmlPath, "utf8"),
  ]);
  const appHtml = render();
  const marker = '<div id="root"></div>';

  if (!template.includes(marker)) {
    throw new Error("Static HTML root marker was not found");
  }

  const rendered = template.replace(
    marker,
    `<div id="root">${appHtml}</div>`,
  );
  const temporaryPath = `${htmlPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, rendered, "utf8");
  await rename(temporaryPath, htmlPath);
  process.stdout.write("Static reader pre-rendered successfully.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
