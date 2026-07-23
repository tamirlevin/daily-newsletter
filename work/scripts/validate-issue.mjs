#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeSourceUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function validateIssue(issue) {
  const errors = [];
  const storyIds = new Set();
  const sectionIds = new Set();
  let storyCount = 0;
  const isDemonstration = /^demo\b/i.test(issue?.status ?? "");

  if (issue?.schemaVersion !== 1) {
    errors.push("schemaVersion must equal 1");
  }

  for (const field of [
    "title",
    "issue",
    "label",
    "status",
    "generatedAt",
    "period",
    "summary",
  ]) {
    if (!isNonEmptyString(issue?.[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (!Array.isArray(issue?.sections) || issue.sections.length === 0) {
    errors.push("sections must contain at least one section");
  } else {
    for (const section of issue.sections) {
      if (!isNonEmptyString(section?.id)) {
        errors.push("every section must have an id");
      } else if (sectionIds.has(section.id)) {
        errors.push(`duplicate section id: ${section.id}`);
      } else {
        sectionIds.add(section.id);
      }

      for (const field of ["shortTitle", "title", "description"]) {
        if (!isNonEmptyString(section?.[field])) {
          errors.push(`section ${section?.id ?? "(unknown)"} needs ${field}`);
        }
      }

      if (!Array.isArray(section?.stories)) {
        errors.push(`section ${section?.id ?? "(unknown)"} needs stories`);
        continue;
      }

      for (const story of section.stories) {
        storyCount += 1;
        if (!isNonEmptyString(story?.id)) {
          errors.push("every story must have an id");
        } else if (storyIds.has(story.id)) {
          errors.push(`duplicate story id: ${story.id}`);
        } else {
          storyIds.add(story.id);
        }

        for (const field of [
          "title",
          "summary",
          "whyItMatters",
          "source",
          "sourceClass",
          "category",
          "meta",
          "state",
          "priority",
        ]) {
          if (!isNonEmptyString(story?.[field])) {
            errors.push(`story ${story?.id ?? "(unknown)"} needs ${field}`);
          }
        }

        if (!["lead", "standard"].includes(story?.priority)) {
          errors.push(
            `story ${story?.id ?? "(unknown)"} has invalid priority`,
          );
        }
        if (story?.url && !isSafeSourceUrl(story.url)) {
          errors.push(
            `story ${story?.id ?? "(unknown)"} must use an HTTPS source URL`,
          );
        }
        if (!isDemonstration && !story?.url) {
          errors.push(
            `published story ${story?.id ?? "(unknown)"} needs a source URL`,
          );
        }
      }
    }
  }

  if (!issue?.review || typeof issue.review !== "object") {
    errors.push("review metadata is required");
  } else {
    if (issue.review.totalItems !== storyCount) {
      errors.push(
        `review.totalItems must equal the ${storyCount} rendered stories`,
      );
    }
    if (
      !Number.isInteger(issue.review.itemsReviewed) ||
      issue.review.itemsReviewed < 0 ||
      issue.review.itemsReviewed > storyCount
    ) {
      errors.push("review.itemsReviewed must be between 0 and totalItems");
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Approved issue validation failed:\n- ${errors.join("\n- ")}`,
    );
  }

  return issue;
}

async function main() {
  const issuePath = path.resolve(
    projectRoot,
    process.argv[2] ?? "data/issue.json",
  );
  const issue = JSON.parse(await readFile(issuePath, "utf8"));
  validateIssue(issue);
  process.stdout.write(
    `Approved issue is valid (${issue.review.totalItems} stories).\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
