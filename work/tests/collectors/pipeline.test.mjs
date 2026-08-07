import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectBrief } from "../../lib/collector/pipeline.mjs";
import { titleFromUrl } from "../../lib/collector/shared.mjs";

async function fixture(name) {
  return readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

function alphaArticle(url) {
  const title = titleFromUrl(url);
  const evidenceUrl = title.toLocaleLowerCase().includes("paper")
    ? "https://arxiv.org/abs/2607.12345"
    : "https://openai.com/example/spend-limits";

  return `<!doctype html>
    <html>
      <head><meta name="description" content="${title} with evidence and operating context." /></head>
      <body><main><h1>${title}</h1><a href="${evidenceUrl}">Original source</a></main></body>
    </html>`;
}

test("builds a publishable run and source-health report without source prose", async () => {
  const responses = new Map([
    [
      "https://tldr.tech/api/rss/ai",
      await fixture("tldr-feed.xml"),
    ],
    [
      "https://tldr.tech/ai/2026-07-22",
      await fixture("tldr-issue.html"),
    ],
    [
      "https://alphasignal.ai/sitemaps/news.xml",
      await fixture("alphasignal-sitemap.xml"),
    ],
    [
      "https://openai.com/news/rss.xml",
      await fixture("official-news.xml"),
    ],
    [
      "https://blog.google/rss/",
      await fixture("official-news.xml"),
    ],
    [
      "https://blog.modelcontextprotocol.io/index.xml",
      await fixture("builder-news.xml"),
    ],
    [
      "https://www.anthropic.com/news",
      await fixture("anthropic-news.html"),
    ],
  ]);

  async function fakeFetchText(url) {
    const text = responses.get(url) ??
      (url.startsWith("https://alphasignal.ai/news/")
        ? alphaArticle(url)
        : url.startsWith("https://www.anthropic.com/news/")
          ? await fixture("anthropic-article.html")
          : url.startsWith("https://hn.algolia.com/api/v1/search_by_date")
            ? await fixture("hackernews.json")
        : null);
    if (!text) throw new Error(`Unexpected fixture request: ${url}`);
    return {
      text,
      finalUrl: url,
      status: 200,
      contentType: "text/html",
      durationMs: 1,
      bytes: Buffer.byteLength(text),
    };
  }

  const config = {
    schemaVersion: 2,
    timeZone: "Australia/Melbourne",
    cadences: {
      daily: {
        lookbackDays: 3,
        maxItems: 5,
        editorialMix: {
          executive: 0.6,
          technical: 0.2,
          builder: 0.2,
        },
        selectionRules: { maxModelLabItems: 2 },
      },
      weekly: {
        lookbackDays: 7,
        maxItems: 10,
        editorialMix: {
          executive: 0.7,
          technical: 0.2,
          builder: 0.1,
        },
        selectionRules: { maxModelLabItems: 3 },
      },
    },
    enrichmentPoolMultiplier: 3,
    requestConcurrency: 2,
    sourceSignals: {
      discoveryWeight: {
        "diverse-newsletter": 1,
        "community-signal": 0.85,
        "official-ecosystem": 0.68,
        "official-lab": 0.3,
      },
      evidenceAuthority: {
        "diverse-newsletter": 0.45,
        "community-signal": 0.25,
        "official-lab": 1,
        "official-ecosystem": 1,
      },
    },
    selectionRules: {
      maxUncorroboratedOfficialItemsPerVendor: 1,
      modelLabVendors: ["openai", "anthropic", "google"],
      maxModelLabItemsPerVendor: 1,
      maxSoleDiscoveryItemsBySource: {
        "hacker-news": 3,
      },
      maxSoleDiscoveryItemsBySourcePerLane: {
        "hacker-news": 1,
      },
    },
    sources: [
      {
        id: "tldr-ai",
        name: "TLDR AI",
        type: "tldr",
        role: "diverse-newsletter",
        kind: "discovery",
        enabled: true,
        feedUrl: "https://tldr.tech/api/rss/ai",
        maxIssues: 1,
      },
      {
        id: "alphasignal",
        name: "AlphaSignal",
        type: "alphasignal",
        role: "diverse-newsletter",
        kind: "discovery",
        enabled: true,
        sitemapUrl: "https://alphasignal.ai/sitemaps/news.xml",
        maxEntries: 20,
      },
      {
        id: "hacker-news",
        name: "Hacker News",
        type: "hackernews",
        role: "community-signal",
        kind: "discovery",
        enabled: true,
        apiUrl: "https://hn.algolia.com/api/v1/search_by_date",
        minPoints: 20,
        hitsPerPage: 500,
        maxPages: 2,
      },
      {
        id: "openai-news",
        name: "OpenAI News",
        type: "official-rss",
        role: "official-lab",
        kind: "primary",
        vendor: "openai",
        enabled: true,
        feedUrl: "https://openai.com/news/rss.xml",
        includeUrlPatterns: ["openai\\.com"],
      },
      {
        id: "anthropic-news",
        name: "Anthropic News",
        type: "anthropic",
        role: "official-lab",
        kind: "primary",
        vendor: "anthropic",
        enabled: true,
        url: "https://www.anthropic.com/news",
      },
      {
        id: "google-ai-news",
        name: "Google AI / DeepMind",
        type: "official-rss",
        role: "official-lab",
        kind: "primary",
        vendor: "google",
        enabled: true,
        feedUrl: "https://blog.google/rss/",
        includeCategoryPatterns: ["^Gemini models$"],
        excludeTitlePatterns: ["\\b(?:tips?|ways) (?:for|to)\\b"],
      },
      {
        id: "mcp-blog",
        name: "Model Context Protocol Blog",
        type: "official-rss",
        role: "official-ecosystem",
        kind: "primary",
        vendor: "model-context-protocol",
        enabled: true,
        feedUrl: "https://blog.modelcontextprotocol.io/index.xml",
      },
    ],
  };

  const { draft, healthReport } = await collectBrief({
    config,
    asOf: new Date("2026-07-23T00:00:00.000Z"),
    fetchText: fakeFetchText,
  });

  assert.equal(draft.kind, "collection-draft");
  assert.equal(draft.schemaVersion, 3);
  assert.equal(draft.cadence, "weekly");
  assert.equal(draft.runId, "weekly:2026-07-23");
  assert.equal(draft.editorialPolicy.profile, "weekly");
  assert.equal(draft.status, "ready-to-publish");
  assert.equal(draft.issueDate, "2026-07-23");
  assert.equal(draft.items.length, 10);
  assert.equal(draft.sourceHealth.status, "healthy");
  assert.equal(healthReport.sources.length, 7);
  assert.equal(healthReport.sources.every(({ status }) => status === "healthy"), true);
  assert.equal(
    healthReport.sources.find(({ id }) => id === "hacker-news")
      .acceptedCandidates,
    1,
  );
  assert.equal(
    healthReport.sources.find(({ id }) => id === "google-ai-news")
      .acceptedCandidates,
    1,
  );
  assert.equal(
    healthReport.sources.find(({ id }) => id === "mcp-blog")
      .acceptedCandidates,
    1,
  );
  assert.equal(healthReport.totals.directXLinksInRawCandidates, 1);
  assert.equal(
    draft.editorialPolicy.directXCoverage.directIngestionStatus,
    "not-configured",
  );
  assert.deepEqual(draft.sourceHealth.summaryCoverage, {
    generated: 0,
    unavailable: 10,
  });

  const { draft: dailyDraft } = await collectBrief({
    config,
    cadence: "daily",
    asOf: new Date("2026-07-23T00:00:00.000Z"),
    lookbackDays: 7,
    excludedUrls: [draft.items[0].url],
    fetchText: fakeFetchText,
    summarizeCandidates: async (candidates) =>
      candidates.map((_, index) =>
        index === 0
          ? null
          : "The selected source describes a material artificial intelligence development and provides enough evidence to establish what changed. The briefing preserves the original link for full context while presenting the item within its assigned editorial lane and without promotional framing.",
      ),
  });
  assert.equal(dailyDraft.runId, "daily:2026-07-23");
  assert.equal(dailyDraft.items.length, 5);
  assert.deepEqual(dailyDraft.editorialPolicy.selectedMix, {
    executive: 3,
    technical: 1,
    builder: 1,
  });
  assert.equal(
    dailyDraft.items.some((item) => item.url === draft.items[0].url),
    false,
  );
  assert.deepEqual(dailyDraft.sourceHealth.summaryCoverage, {
    generated: 4,
    unavailable: 1,
  });
  assert.equal(dailyDraft.items[0].summaryStatus, "unavailable");
  assert.equal("briefSummary" in dailyDraft.items[0], false);
  assert.equal(
    dailyDraft.items.slice(1).every(
      (item) =>
        item.summaryStatus === "generated" &&
        typeof item.briefSummary === "string",
    ),
    true,
  );

  for (const item of draft.items) {
    assert.equal("editorialText" in item, false);
    assert.equal("preliminaryTitle" in item, false);
    assert.equal(item.summaryStatus, "unavailable");
    assert.equal(item.reviewStatus, "needs-review");
    assert.ok(item.sourceAttributions.length > 0);
  }

  const { draft: summaryFailureDraft } = await collectBrief({
    config,
    cadence: "daily",
    asOf: new Date("2026-07-23T00:00:00.000Z"),
    lookbackDays: 7,
    fetchText: fakeFetchText,
    summarizeCandidates: async () => {
      throw new Error("summary provider unavailable");
    },
  });

  assert.equal(summaryFailureDraft.items.length, 5);
  assert.equal(
    summaryFailureDraft.items.every(
      (item) =>
        item.summaryStatus === "unavailable" &&
        !("briefSummary" in item),
    ),
    true,
  );
  assert.deepEqual(summaryFailureDraft.sourceHealth.summaryCoverage, {
    generated: 0,
    unavailable: 5,
  });
});
