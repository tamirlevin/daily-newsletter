#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

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
  const draftPath = process.argv[2]
    ? path.resolve(projectRoot, process.argv[2])
    : await latestJson(path.resolve(projectRoot, "data/drafts"));
  const draft = JSON.parse(await readFile(draftPath, "utf8"));
  const mix = draft.editorialPolicy?.selectedMix ?? {};

  const lines = [
    "# AI Weekly Brief — candidate review",
    "",
    `**Issue date:** ${tableText(draft.issueDate)}  `,
    `**Source health:** ${tableText(draft.sourceHealth?.status)} (${
      draft.sourceHealth?.healthySources ?? 0
    }/${draft.sourceHealth?.configuredSources ?? 0} healthy)  `,
    `**Editorial mix:** ${mix.executive ?? 0} executive · ${
      mix.technical ?? 0
    } technical · ${mix.research ?? 0} research`,
    "",
    "> This is a review queue, not a published issue. Titles and links come from source metadata; summaries must be written and checked before release.",
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
