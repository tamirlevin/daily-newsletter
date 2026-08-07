import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function renderedHtml() {
  return readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
}

async function clientBundle() {
  const html = await renderedHtml();
  const source = html.match(/<script[^>]+src="([^"]+\.js)"/i)?.[1];
  assert.ok(source, "Expected the production client bundle");
  return readFile(new URL(`../dist/client${source}`, import.meta.url), "utf8");
}

async function serverRenderer() {
  return import(
    new URL(
      `../dist-ssr/entry-server.js?test=${Date.now()}`,
      import.meta.url,
    ).href
  );
}

async function seedRun(cadence) {
  const name =
    cadence === "daily" ? "seed-daily-run.json" : "seed-run.json";
  return JSON.parse(
    await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"),
  );
}

test("statically renders the complete public Daily briefing", async () => {
  const html = await renderedHtml();

  assert.match(html, /<title>AI Daily \+ Weekly Brief<\/title>/i);
  assert.match(html, /Daily(?:<!-- -->)? briefing/i);
  assert.match(html, /Published automatically/);
  assert.match(html, /href="#daily"/);
  assert.match(html, /href="#weekly"/);
  assert.match(html, /href="#history-daily"/);
  assert.match(html, /href="#system"/);
  assert.match(html, /How it works/);
  assert.match(html, /og-compact\.png/i);
  assert.match(html, /summary_large_image/i);
  assert.equal((html.match(/class="story-row"/g) ?? []).length, 5);
  assert.match(
    html,
    /Google Research examines how artificial intelligence/,
  );
  assert.doesNotMatch(html, /class="run-card"/);
  assert.doesNotMatch(html, /class="brief-stats"/);

  await access(new URL("../dist/client/og-compact.png", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});

test("keeps editorial controls out of the public reader", async () => {
  const html = await renderedHtml();

  assert.doesNotMatch(html, /Editorial review required/i);
  assert.doesNotMatch(html, />\s*Approve\s*</i);
  assert.doesNotMatch(html, />\s*Promote\s*</i);
  assert.doesNotMatch(html, /role="progressbar"/i);
  assert.doesNotMatch(html, /codex-preview/i);
  assert.doesNotMatch(html, /javascript:/i);
});

test("renders accessible reader controls", async () => {
  const html = await renderedHtml();

  assert.doesNotMatch(html, /id="brief-search-daily"/i);
  assert.doesNotMatch(html, /data-filter=/i);
  assert.match(html, /class="skip-link" href="#view-content"/i);
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
});

test("keeps controls cadence-specific and gives each History a search", async () => {
  const daily = await seedRun("daily");
  const weekly = await seedRun("weekly");
  const { renderWithRuns } = await serverRenderer();
  const runs = { daily: [daily], weekly: [weekly] };

  const dailyHtml = renderWithRuns(runs, "daily");
  assert.doesNotMatch(dailyHtml, /type="search"/i);
  assert.doesNotMatch(dailyHtml, /data-filter=/i);

  const weeklyHtml = renderWithRuns(runs, "weekly");
  assert.match(weeklyHtml, /id="brief-search-weekly"[^>]+type="search"/i);
  assert.match(weeklyHtml, /Builder signal/i);
  assert.match(
    weeklyHtml,
    /role="group"[^>]+aria-label="Filter Weekly stories by category"/i,
  );
  assert.equal((weeklyHtml.match(/data-filter=/g) ?? []).length, 4);

  const dailyHistoryHtml = renderWithRuns(runs, "history-daily");
  assert.match(
    dailyHistoryHtml,
    /id="history-search-daily"[^>]+type="search"/i,
  );
  const weeklyHistoryHtml = renderWithRuns(runs, "history-weekly");
  assert.match(
    weeklyHistoryHtml,
    /id="history-search-weekly"[^>]+type="search"/i,
  );
});

test("renders a schema-version-2 run without generated summaries", async () => {
  const daily = await seedRun("daily");
  const weekly = await seedRun("weekly");
  const legacy = structuredClone(daily);
  legacy.schemaVersion = 2;
  for (const story of legacy.items) {
    delete story.briefSummary;
    delete story.summaryStatus;
  }

  const { renderWithRuns } = await serverRenderer();
  const html = renderWithRuns(
    { daily: [legacy], weekly: [weekly] },
    "daily",
  );

  assert.equal((html.match(/class="story-row"/g) ?? []).length, 5);
  assert.match(html, /Open the linked source for the full published context/);
});

test("renders retained research history after the active lane becomes builder", async () => {
  const daily = await seedRun("daily");
  const weekly = await seedRun("weekly");
  const legacy = structuredClone(weekly);
  const builder = legacy.items.find(
    (story) => story.editorialLane === "builder",
  );
  assert.ok(builder);
  builder.editorialLane = "research";
  delete legacy.editorialPolicy.selectedMix.builder;
  legacy.editorialPolicy.selectedMix.research = 1;

  const { renderWithRuns } = await serverRenderer();
  const latestHtml = renderWithRuns(
    { daily: [daily], weekly: [legacy] },
    "weekly",
  );
  assert.match(latestHtml, /Research watch/i);
  assert.equal((latestHtml.match(/data-filter=/g) ?? []).length, 4);

  const historyHtml = renderWithRuns(
    { daily: [daily], weekly: [legacy] },
    "history-weekly",
  );
  assert.match(historyHtml, /Research watch/i);
  assert.match(historyHtml, />7\/2\/1</);
});

test("renders a schema-version-3 unavailable summary as a link-only row", async () => {
  const daily = await seedRun("daily");
  const weekly = await seedRun("weekly");
  const linkOnlyTitle = daily.items[0].title;
  delete daily.items[0].briefSummary;
  daily.items[0].summaryStatus = "unavailable";

  const { renderWithRuns } = await serverRenderer();
  const html = renderWithRuns(
    { daily: [daily], weekly: [weekly] },
    "daily",
  );

  assert.match(html, new RegExp(linkOnlyTitle));
  assert.doesNotMatch(
    html,
    /This item was selected for commercial or operating impact/,
  );
  assert.equal((html.match(/class="story-row__summary"/g) ?? []).length, 4);
});

test("keeps separate Daily and Weekly reader histories", async () => {
  const bundle = await clientBundle();

  assert.match(bundle, /history-daily/);
  assert.match(bundle, /history-weekly/);
  assert.match(bundle, /api\/runs\?cadence=/);
  assert.match(bundle, /Daily email/);
});

test("links the system page to its durable repository memory", async () => {
  const bundle = await clientBundle();

  assert.match(
    bundle,
    /https:\/\/github\.com\/tamirlevin\/daily-newsletter/,
  );
  assert.match(bundle, /daily-newsletter\/blob\/main\/AGENTS\.md/);
  assert.match(bundle, /Built to be resumed, not remembered\./);
});
