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

test("builds a local review draft and source-health report without source prose", async () => {
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
            : url.startsWith("https://huggingface.co/api/daily_papers")
              ? await fixture("huggingface-papers.json")
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
    schemaVersion: 1,
    timeZone: "Australia/Melbourne",
    lookbackDays: 7,
    maxItems: 10,
    enrichmentPoolMultiplier: 3,
    requestConcurrency: 2,
    editorialMix: {
      executive: 0.7,
      technical: 0.2,
      research: 0.1,
    },
    sourceSignals: {
      discoveryWeight: {
        "diverse-newsletter": 1,
        "community-signal": 0.85,
        "official-lab": 0.6,
        "research-index": 0.55,
      },
      evidenceAuthority: {
        "diverse-newsletter": 0.45,
        "community-signal": 0.25,
        "official-lab": 1,
        "research-index": 0.85,
      },
    },
    selectionRules: {
      maxUncorroboratedOfficialItemsPerVendor: 1,
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
        id: "huggingface-papers",
        name: "Hugging Face Daily Papers",
        type: "huggingface-papers",
        role: "research-index",
        kind: "discovery",
        enabled: true,
        apiUrl: "https://huggingface.co/api/daily_papers",
        maxPaperAgeDays: 45,
      },
    ],
  };

  const { draft, healthReport } = await collectBrief({
    config,
    asOf: new Date("2026-07-23T00:00:00.000Z"),
    fetchText: fakeFetchText,
  });

  assert.equal(draft.kind, "collection-draft");
  assert.equal(draft.status, "needs-editorial-review");
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
    healthReport.sources.find(({ id }) => id === "huggingface-papers")
      .acceptedCandidates,
    1,
  );
  assert.equal(healthReport.totals.directXLinksInRawCandidates, 1);
  assert.equal(
    draft.editorialPolicy.directXCoverage.directIngestionStatus,
    "not-configured",
  );

  for (const item of draft.items) {
    assert.equal("editorialText" in item, false);
    assert.equal("preliminaryTitle" in item, false);
    assert.equal(item.summaryStatus, "not-generated");
    assert.equal(item.reviewStatus, "needs-review");
    assert.ok(item.sourceAttributions.length > 0);
  }
});
