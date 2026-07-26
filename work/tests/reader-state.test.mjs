import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  discoveryLabel,
  historyRunMatches,
  issueStoryNumber,
  publisherLabel,
  storyMatches,
  visibleHistoryStories,
} from "../app/briefing-filters.mjs";

async function seedRun(cadence) {
  const name =
    cadence === "daily" ? "seed-daily-run.json" : "seed-run.json";
  return JSON.parse(
    await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"),
  );
}

test("separates publisher identity from discovery attribution", async () => {
  const daily = await seedRun("daily");
  const weekly = await seedRun("weekly");
  const story = daily.items[0];

  assert.equal(publisherLabel(story), "Google Research");
  assert.equal(discoveryLabel(story), "TLDR AI + Hacker News");
  assert.notEqual(publisherLabel(story), story.discoveredBy[0]);
  assert.equal(publisherLabel(weekly.items[0]), "OpenAI");
  assert.match(discoveryLabel(weekly.items[0]), /OpenAI News/);
});

test("Weekly story search covers headline, publisher, and category", async () => {
  const weekly = await seedRun("weekly");

  assert.equal(
    weekly.items.filter((story) => storyMatches(story, "LM Studio")).length,
    1,
  );
  assert.equal(
    weekly.items.filter((story) => storyMatches(story, "For Builders")).length,
    2,
  );
  assert.equal(
    weekly.items.filter((story) => storyMatches(story, "OpenAI")).length > 0,
    true,
  );
});

test("Weekly filtering preserves the original global story number", async () => {
  const weekly = await seedRun("weekly");
  const builders = weekly.items.filter((story) =>
    storyMatches(story, "For Builders"),
  );

  assert.deepEqual(
    builders.map((story) => issueStoryNumber(weekly.items, story)),
    [8, 9],
  );
});

test("History matches issue date, headline, publisher, and category", async () => {
  const daily = await seedRun("daily");
  const issueLabel = "Saturday 25 July 2026";

  assert.equal(historyRunMatches(daily, "25 July", issueLabel), true);
  assert.equal(historyRunMatches(daily, "AI economy", issueLabel), true);
  assert.equal(historyRunMatches(daily, "Google Research", issueLabel), true);
  assert.equal(historyRunMatches(daily, "Research Watch", issueLabel), true);
  assert.equal(historyRunMatches(daily, "no such issue", issueLabel), false);

  assert.equal(
    visibleHistoryStories(daily, "Research Watch", issueLabel).length,
    1,
  );
  assert.equal(
    visibleHistoryStories(daily, "25 July", issueLabel).length,
    daily.items.length,
  );
});
