import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function renderedHtml() {
  return readFile(new URL("../dist/index.html", import.meta.url), "utf8");
}

test("statically renders the complete editorial prototype", async () => {
  const html = await renderedHtml();
  assert.match(html, /<title>AI Weekly Brief<\/title>/i);
  assert.match(html, /The signal/);
  assert.match(html, /beneath the noise\./);
  assert.match(html, /Demo · awaiting first refresh/);
  assert.match(html, /7 collectors validated/);
  assert.match(html, /Refresh often\./);
  assert.match(html, /Publish deliberately\./);
  assert.match(html, /og\.png/i);
  assert.match(html, /summary_large_image/i);
  assert.equal((html.match(/data-story-card="true"/g) ?? []).length, 5);
  await access(new URL("../dist/og.png", import.meta.url));
});

test("removes starter metadata and known unsafe placeholder behavior", async () => {
  const html = await renderedHtml();

  assert.doesNotMatch(html, /codex-preview/i);
  assert.doesNotMatch(html, /Your site is taking shape/i);
  assert.doesNotMatch(html, /react-loading-skeleton/i);
  assert.doesNotMatch(html, /Private workspace/i);
  assert.doesNotMatch(html, /href=["']#refresh["']/i);
  assert.doesNotMatch(html, /href=["']javascript:/i);
});

test("renders accessible controls and review state", async () => {
  const html = await renderedHtml();

  assert.match(html, /<label[^>]+for="brief-search"/i);
  assert.match(html, /id="brief-search"[^>]+type="search"/i);
  assert.match(html, /role="group"[^>]+aria-label="Filter by section"/i);
  assert.equal((html.match(/data-filter=/g) ?? []).length, 5);
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 5);
  assert.match(html, /role="progressbar"/i);
  assert.match(html, /aria-label="Editorial review progress"/i);
  assert.match(html, /class="skip-link" href="#briefing"/i);
});

test("issue data has stable, unique identifiers and the intended mix", async () => {
  const raw = await readFile(
    new URL("../data/issue.json", import.meta.url),
    "utf8",
  );
  const issue = JSON.parse(raw);
  const stories = issue.sections.flatMap((section) => section.stories);

  assert.equal(issue.schemaVersion, 1);
  assert.equal(issue.sections.length, 4);
  assert.deepEqual(
    issue.sections.map((section) => section.stories.length),
    [2, 1, 1, 1],
  );
  assert.equal(stories.length, 5);
  assert.equal(new Set(issue.sections.map((section) => section.id)).size, 4);
  assert.equal(new Set(stories.map((story) => story.id)).size, 5);

  for (const story of stories) {
    assert.match(story.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(story.sourceClass, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(story.title.length > 0);
    assert.ok(story.summary.length > 0);
    assert.ok(story.whyItMatters.length > 0);
    if ("url" in story) {
      assert.match(story.url, /^https:\/\//);
    }
  }
});
