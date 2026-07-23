import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  enrichAlphaCandidate,
  parseAlphaArticle,
  parseAlphaSitemap,
} from "../../lib/collector/alphasignal.mjs";
import {
  parseAnthropicArticle,
  parseAnthropicNewsroom,
} from "../../lib/collector/anthropic.mjs";
import {
  isAiRelevantHackerNewsStory,
  parseHackerNewsResponse,
} from "../../lib/collector/hackernews.mjs";
import {
  isoWeekKey,
  parseHuggingFacePapers,
} from "../../lib/collector/huggingface.mjs";
import { parseOfficialFeed } from "../../lib/collector/official-rss.mjs";
import {
  parseTldrFeed,
  parseTldrIssue,
} from "../../lib/collector/tldr.mjs";

async function fixture(name) {
  return readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

test("parses TLDR's stable feed and rejects malformed entries", async () => {
  const items = parseTldrFeed(await fixture("tldr-feed.xml"));

  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    title: "Enterprise agents, an open SDK, and a new benchmark",
    url: "https://tldr.tech/ai/2026-07-22",
    publishedAt: "2026-07-22T00:00:00.000Z",
  });
});

test("extracts TLDR stories while removing sponsors and house promotion", async () => {
  const stories = parseTldrIssue(await fixture("tldr-issue.html"), {
    url: "https://tldr.tech/ai/2026-07-22",
    publishedAt: "2026-07-22T00:00:00.000Z",
  });

  assert.equal(stories.length, 4);
  assert.equal(
    stories[0].url,
    "https://example.com/enterprise-agents?id=42",
  );
  assert.equal(
    stories[0].title,
    "Enterprise agents move from pilots into operating budgets",
  );
  assert.equal(stories[0].readingTime, "4 minute read");
  assert.equal(stories[1].url, "https://x.com/example/status/123");
  assert.equal(stories[2].section, "Engineering & Research");
  assert.ok(stories.every((story) => !/sponsor|hiring/i.test(story.title)));
});

test("uses AlphaSignal's allowed full sitemap for a weekly window", async () => {
  const candidates = parseAlphaSitemap(
    await fixture("alphasignal-sitemap.xml"),
    {
      asOf: new Date("2026-07-23T00:00:00.000Z"),
      lookbackDays: 7,
      maxEntries: 120,
    },
  );

  assert.equal(candidates.length, 2);
  assert.equal(
    candidates[0].url,
    "https://alphasignal.ai/news/openai-ships-hard-spend-limits-for-enterprise-agents",
  );
  assert.match(candidates[0].title, /Openai Ships Hard Spend Limits/i);
});

test("enriches AlphaSignal metadata and prefers independent evidence links", async () => {
  const article = parseAlphaArticle(
    await fixture("alphasignal-article.html"),
    "https://alphasignal.ai/news/openai-ships-hard-spend-limits-for-enterprise-agents",
  );

  assert.equal(
    article.title,
    "OpenAI ships hard spend limits for enterprise agents",
  );
  assert.match(article.description, /governed spend controls/);
  assert.deepEqual(article.externalUrls, [
    "https://openai.com/example/spend-limits",
    "https://x.com/OpenAIDevs/status/123",
  ]);
});

test("keeps the AlphaSignal article as the citation when evidence is only a generic homepage", async () => {
  const articleUrl =
    "https://alphasignal.ai/news/openai-ships-hard-spend-limits";
  const candidate = {
    title: "Openai Ships Hard Spend Limits",
    url: articleUrl,
    canonicalUrl: articleUrl,
    originalDomain: "alphasignal.ai",
    preliminaryTitle: true,
    editorialText: "Openai Ships Hard Spend Limits",
    sourceAttributions: [
      {
        sourceId: "alphasignal",
        sourceName: "AlphaSignal",
        sourceRole: "diverse-newsletter",
        sourceUrl: articleUrl,
        section: "AlphaSignal Editorial",
      },
    ],
  };
  const html = `<!doctype html><html><head>
    <meta name="description" content="Enterprise spend controls" />
    </head><body><main>
    <h1>OpenAI Ships Hard Spend Limits</h1>
    <a href="https://platform.openai.com/">Platform</a>
    </main></body></html>`;

  const enriched = await enrichAlphaCandidate(candidate, async () => ({
    text: html,
  }));

  assert.equal(enriched.url, articleUrl);
  assert.deepEqual(enriched.evidenceUrls, ["https://platform.openai.com/"]);
});

test("parses structured official RSS metadata", async () => {
  const items = parseOfficialFeed(await fixture("official-news.xml"));

  assert.equal(items.length, 4);
  assert.deepEqual(items[0], {
    title: "Frontier model adds governed enterprise agent controls",
    url: "https://openai.com/example/governed-agents",
    publishedAt: "2026-07-22T13:00:00.000Z",
    description:
      "New controls cover budgets, audit trails, and deployment approvals.",
    categories: ["Product"],
  });
});

test("uses Anthropic newsroom dates and article metadata instead of sitemap edits", async () => {
  const entries = parseAnthropicNewsroom(
    await fixture("anthropic-news.html"),
    "https://www.anthropic.com/news",
  );
  const article = parseAnthropicArticle(
    await fixture("anthropic-article.html"),
  );

  assert.equal(entries.length, 3);
  assert.deepEqual(entries[0], {
    title: "Claude adds enterprise deployment controls",
    url: "https://www.anthropic.com/news/enterprise-controls",
    publishedAt: "2026-07-22T12:00:00.000Z",
    category: "Product",
  });
  assert.equal(article.publishedAt, "2026-07-22T17:00:00.000Z");
  assert.match(article.description, /auditability/);
});

test("filters Hacker News with token-aware AI relevance", async () => {
  const response = parseHackerNewsResponse(
    await fixture("hackernews.json"),
  );

  assert.equal(response.hits.length, 3);
  assert.equal(isAiRelevantHackerNewsStory(response.hits[0]), true);
  assert.equal(isAiRelevantHackerNewsStory(response.hits[1]), false);
});

test("parses Hugging Face paper dates and ISO week keys", async () => {
  const papers = parseHuggingFacePapers(
    await fixture("huggingface-papers.json"),
  );

  assert.equal(isoWeekKey(new Date("2026-07-23T00:00:00.000Z")), "2026-W30");
  assert.equal(papers.length, 3);
  assert.equal(papers[0].id, "2607.12345");
  assert.equal(papers[0].submittedAt, "2026-07-21T00:00:00.000Z");
  assert.equal(papers[1].publishedAt, "2024-01-01T00:00:00.000Z");
});
