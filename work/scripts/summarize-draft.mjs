#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function tableText(value) {
  return String(value ?? "—").replace(/\|/g, "\\|").replace(/\s+/g, " ");
}

async function latestJson(directory) {
  const entries = (await readdir(directory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const latest = entries.at(-1);
  if (!latest) throw new Error(`No JSON drafts found in ${directory}`);
  return path.join(directory, latest);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const cadence = String(options.cadence ?? "weekly").toLocaleLowerCase();
  const draftPath = options.path
    ? path.resolve(projectRoot, options.path)
    : await latestJson(path.resolve(projectRoot, "data/drafts", cadence));
  const draft = JSON.parse(await readFile(draftPath, "utf8"));
  const mix = draft.editorialPolicy?.selectedMix ?? {};

  const lines = [
    `# AI ${draft.cadence === "daily" ? "Daily" : "Weekly"} Brief — publication run`,
    "",
    `**Issue date:** ${tableText(draft.issueDate)}  `,
    `**Source health:** ${tableText(draft.sourceHealth?.status)} (${
      draft.sourceHealth?.healthySources ?? 0
    }/${draft.sourceHealth?.configuredSources ?? 0} healthy)  `,
    `**Editorial mix:** ${mix.executive ?? 0} executive · ${
      mix.technical ?? 0
    } technical · ${mix.research ?? 0} research`,
    "",
    `> A complete run is published automatically after the site verifies the ${draft.items?.length ?? 0}-story ${mix.executive ?? 0}/${mix.technical ?? 0}/${mix.research ?? 0} mix, source health, unique links, and evidence flags.`,
    "",
    "| Lane | Candidate | Discovery | Evidence | Score |",
    "| --- | --- | --- | --- | ---: |",
  ];

  for (const item of draft.items ?? []) {
    const linkedTitle = item.url
      ? `[${tableText(item.title)}](${item.url})`
      : tableText(item.title);
    const discovery = tableText((item.discoveredBy ?? []).join(", "));
    const authority = item.sourceSignals?.evidenceAuthority ?? 0;
    const evidence =
      authority >= 0.9
        ? "Primary"
        : item.flags?.needsPrimaryEvidenceReview
          ? "Review needed"
          : "Secondary";
    lines.push(
      `| ${tableText(item.editorialLane)} | ${linkedTitle} | ${discovery} | ${evidence} | ${tableText(item.score)} |`,
    );
  }

  lines.push(
    "",
    `Direct X links selected: ${
      draft.editorialPolicy?.directXCoverage?.selected ?? 0
    } (no direct X collector)`,
  );

  process.stdout.write(`${lines.join("\n")}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
