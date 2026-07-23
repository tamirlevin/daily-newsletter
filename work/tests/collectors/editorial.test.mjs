import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyLane,
  computeMixQuotas,
  dedupeCandidates,
  isPromotionalStory,
  prepareCandidate,
  scoreCandidate,
  selectEditorialMix,
} from "../../lib/collector/editorial.mjs";
import {
  canonicalizeUrl,
  publicCandidate,
} from "../../lib/collector/shared.mjs";

function attribution(sourceId, sourceName, sourceUrl) {
  return {
    sourceId,
    sourceName,
    sourceRole: "diverse-newsletter",
    sourceUrl,
    section: "Headlines & Launches",
  };
}

function candidate({
  title,
  url,
  sourceId,
  sourceName,
  sourceUrl,
  publishedAt = "2026-07-22T00:00:00.000Z",
}) {
  return {
    title,
    url,
    publishedAt,
    section: "Headlines & Launches",
    editorialText: title,
    sourceRole: "diverse-newsletter",
    sourceAttributions: [
      attribution(sourceId, sourceName, sourceUrl),
    ],
  };
}

test("canonicalizes tracking parameters without removing functional parameters", () => {
  assert.equal(
    canonicalizeUrl(
      "https://Example.com/story/?utm_source=tldr&id=42&ref=email#section",
    ),
    "https://example.com/story?id=42",
  );
});

test("identifies sponsored and house-promotional newsletter entries", () => {
  assert.equal(
    isPromotionalStory({ title: "A fast database (Sponsor)" }),
    true,
  );
  assert.equal(
    isPromotionalStory({
      title: "TLDR is hiring a curator",
      text: "Apply here for five hours/week",
    }),
    true,
  );
  assert.equal(
    isPromotionalStory({
      title: "Enterprise AI spending reaches operating budgets",
    }),
    false,
  );
});

test("merges exact and fuzzy duplicates across discovery newsletters", () => {
  const exact = dedupeCandidates([
    candidate({
      title: "OpenAI launches hard spend limits for runaway agents",
      url: "https://openai.com/example/limits?utm_source=tldr",
      sourceId: "tldr-ai",
      sourceName: "TLDR AI",
      sourceUrl: "https://tldr.tech/ai/2026-07-22",
    }),
    candidate({
      title: "OpenAI ships hard spend limits after runaway agents",
      url: "https://openai.com/example/limits",
      sourceId: "alphasignal",
      sourceName: "AlphaSignal",
      sourceUrl: "https://alphasignal.ai/news/openai-hard-spend-limits",
    }),
  ]);

  assert.equal(exact.length, 1);
  assert.equal(exact[0].corroborationCount, 2);
  assert.deepEqual(exact[0].discoveredBy.sort(), ["AlphaSignal", "TLDR AI"]);

  const fuzzy = dedupeCandidates([
    candidate({
      title: "OpenAI launches hard spend limits for runaway agents",
      url: "https://openai.com/announcement",
      sourceId: "tldr-ai",
      sourceName: "TLDR AI",
      sourceUrl: "https://tldr.tech/ai/2026-07-22",
    }),
    candidate({
      title: "OpenAI ships hard spend limits after runaway agents",
      url: "https://alphasignal.ai/news/openai-hard-spend-limits",
      sourceId: "alphasignal",
      sourceName: "AlphaSignal",
      sourceUrl: "https://alphasignal.ai/news/openai-hard-spend-limits",
    }),
  ]);

  assert.equal(fuzzy.length, 1);
  assert.equal(fuzzy[0].url, "https://openai.com/announcement");
});

test("separates discovery coverage from primary-source evidence", () => {
  const merged = dedupeCandidates([
    candidate({
      title: "OpenAI launches governed agent controls",
      url: "https://openai.com/example/governed-agents",
      sourceId: "tldr-ai",
      sourceName: "TLDR AI",
      sourceUrl: "https://tldr.tech/ai/2026-07-22",
    }),
    {
      title: "OpenAI launches governed agent controls",
      url: "https://openai.com/example/governed-agents",
      publishedAt: "2026-07-22T13:00:00.000Z",
      section: "Product",
      editorialText: "Primary product announcement",
      sourceRole: "official-lab",
      sourceKind: "primary",
      vendor: "openai",
      sourceAttributions: [
        {
          sourceId: "openai-news",
          sourceName: "OpenAI News",
          sourceRole: "official-lab",
          sourceKind: "primary",
          sourceUrl: "https://openai.com/example/governed-agents",
          section: "Product",
          vendor: "openai",
        },
      ],
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].discoverySourceCount, 1);
  assert.equal(merged[0].primarySourceCount, 1);
  assert.equal(merged[0].corroborationCount, 1);

  const scored = scoreCandidate(
    merged[0],
    {
      sourceSignals: {
        discoveryWeight: {
          "diverse-newsletter": 1,
          "official-lab": 0.6,
        },
        evidenceAuthority: {
          "diverse-newsletter": 0.45,
          "official-lab": 1,
        },
      },
    },
    new Date("2026-07-23T00:00:00.000Z"),
  );

  assert.equal(scored.sourceSignals.discoveryWeight, 1);
  assert.equal(scored.sourceSignals.evidenceAuthority, 1);
  assert.ok(scored.selectionReasons.includes("primary-source evidence"));
  assert.ok(
    !scored.selectionReasons.some((reason) =>
      reason.includes("2 discovery"),
    ),
  );
});

test("flags newsletter stories that still lack a specific underlying source", () => {
  const [prepared] = dedupeCandidates([
    {
      ...candidate({
        title: "Agent budget controls arrive after a costly incident",
        url: "https://alphasignal.ai/news/agent-budget-controls",
        sourceId: "alphasignal",
        sourceName: "AlphaSignal",
        sourceUrl: "https://alphasignal.ai/news/agent-budget-controls",
      }),
      evidenceUrls: ["https://platform.openai.com/"],
    },
  ]);
  const scored = scoreCandidate(
    prepared,
    {
      sourceSignals: {
        discoveryWeight: { "diverse-newsletter": 1 },
        evidenceAuthority: { "diverse-newsletter": 0.45 },
      },
    },
    new Date("2026-07-23T00:00:00.000Z"),
  );

  assert.equal(scored.flags.needsPrimaryEvidenceReview, true);
  assert.ok(
    scored.selectionReasons.includes(
      "primary evidence requires editorial review",
    ),
  );
});

test("treats the underlying paper URL as primary research evidence", () => {
  const [prepared] = dedupeCandidates([
    {
      title: "A study of reliable long-horizon agents",
      url: "https://arxiv.org/abs/2607.12345",
      publishedAt: "2026-07-22T00:00:00.000Z",
      section: "Research Watch",
      editorialText:
        "A research paper benchmarks agent reliability and oversight.",
      sourceRole: "research-index",
      sourceKind: "discovery",
      sourceAttributions: [
        {
          sourceId: "huggingface-papers",
          sourceName: "Hugging Face Daily Papers",
          sourceRole: "research-index",
          sourceKind: "discovery",
          sourceUrl: "https://huggingface.co/papers/2607.12345",
        },
      ],
    },
  ]);
  const scored = scoreCandidate(
    prepared,
    {
      sourceSignals: {
        discoveryWeight: { "research-index": 0.55 },
        evidenceAuthority: { "research-index": 0.85 },
      },
    },
    new Date("2026-07-23T00:00:00.000Z"),
  );

  assert.equal(scored.sourceSignals.evidenceAuthority, 0.95);
  assert.ok(scored.selectionReasons.includes("primary-source evidence"));
});

test("enforces the 70/20/10 editorial allocation for a ten-item brief", () => {
  assert.deepEqual(
    computeMixQuotas(10, {
      executive: 0.7,
      technical: 0.2,
      research: 0.1,
    }),
    { executive: 7, technical: 2, research: 1 },
  );

  const candidates = [
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `executive-${index}`,
      editorialLane: "executive",
      score: 100 - index,
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `technical-${index}`,
      editorialLane: "technical",
      score: 80 - index,
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `research-${index}`,
      editorialLane: "research",
      score: 60 - index,
    })),
  ];
  const selected = selectEditorialMix(candidates, 10, {
    executive: 0.7,
    technical: 0.2,
    research: 0.1,
  });

  assert.deepEqual(
    selected.reduce(
      (counts, item) => ({
        ...counts,
        [item.editorialLane]: counts[item.editorialLane] + 1,
      }),
      { executive: 0, technical: 0, research: 0 },
    ),
    { executive: 7, technical: 2, research: 1 },
  );
});

test("caps uncorroborated official items from one vendor", () => {
  const selected = selectEditorialMix(
    [
      {
        id: "openai-1",
        editorialLane: "executive",
        score: 100,
        vendor: "openai",
        discoverySourceCount: 0,
        primarySourceCount: 1,
      },
      {
        id: "openai-2",
        editorialLane: "executive",
        score: 99,
        vendor: "openai",
        discoverySourceCount: 0,
        primarySourceCount: 1,
      },
      {
        id: "google-1",
        editorialLane: "executive",
        score: 98,
        vendor: "google",
        discoverySourceCount: 0,
        primarySourceCount: 1,
      },
      {
        id: "community-1",
        editorialLane: "executive",
        score: 97,
        vendor: null,
        discoverySourceCount: 1,
        primarySourceCount: 0,
      },
    ],
    3,
    { executive: 1, technical: 0, research: 0 },
    { maxUncorroboratedOfficialItemsPerVendor: 1 },
  );

  assert.deepEqual(
    selected.map(({ id }) => id),
    ["openai-1", "google-1", "community-1"],
  );
});

test("caps stories found only through one community source", () => {
  const communityCandidate = (id, score) => ({
    id,
    editorialLane: "executive",
    score,
    discoverySourceCount: 1,
    primarySourceCount: 0,
    sourceAttributions: [
      {
        sourceId: "hacker-news",
        sourceRole: "community-signal",
        sourceKind: "discovery",
      },
    ],
  });
  const newsletterCandidate = (id, score) => ({
    id,
    editorialLane: "executive",
    score,
    discoverySourceCount: 1,
    primarySourceCount: 0,
    sourceAttributions: [
      {
        sourceId: id,
        sourceRole: "diverse-newsletter",
        sourceKind: "discovery",
      },
    ],
  });

  const selected = selectEditorialMix(
    [
      communityCandidate("hn-1", 100),
      communityCandidate("hn-2", 99),
      newsletterCandidate("newsletter-1", 98),
      newsletterCandidate("newsletter-2", 97),
    ],
    3,
    { executive: 1, technical: 0, research: 0 },
    {
      maxSoleDiscoveryItemsBySource: { "hacker-news": 3 },
      maxSoleDiscoveryItemsBySourcePerLane: { "hacker-news": 1 },
    },
  );

  assert.deepEqual(
    selected.map(({ id }) => id),
    ["hn-1", "newsletter-1", "newsletter-2"],
  );
});

test("reserves the research lane for explicit papers, studies, or benchmarks", () => {
  const analysis = classifyLane({
    title: "Agent swarms and the new model economics",
    url: "https://example.com/agent-swarms",
    section: "Engineering & Research",
    editorialText:
      "A research-oriented analysis of agent workflows and model economics.",
  });
  const paper = classifyLane({
    title: "New paper benchmarks long-horizon agent reliability",
    url: "https://arxiv.org/abs/2607.12345",
    section: "Engineering & Research",
    editorialText:
      "Researchers publish a benchmark dataset and evaluation study.",
  });
  const benchmarkProduct = classifyLane({
    title: "Can a MUD evaluate LLMs? A $99 proof of concept",
    url: "https://cruciblebench.ai/",
    section: "Hacker News",
    editorialText: "A hosted benchmark product for language models.",
    sourceAttributions: [
      {
        sourceId: "hacker-news",
        sourceRole: "community-signal",
        sourceKind: "discovery",
      },
    ],
  });

  assert.notEqual(analysis.lane, "research");
  assert.equal(paper.lane, "research");
  assert.notEqual(benchmarkProduct.lane, "research");
});

test("treats sole-source Launch HN pitches as technical review candidates", () => {
  const launch = classifyLane({
    title: "Launch HN: Example – AI-powered enterprise planning",
    url: "https://news.ycombinator.com/item?id=123",
    section: "Hacker News",
    editorialText:
      "A company launches an AI product for enterprise customers and operating budgets.",
    sourceAttributions: [
      {
        sourceId: "hacker-news",
        sourceRole: "community-signal",
        sourceKind: "discovery",
      },
    ],
  });

  assert.equal(launch.lane, "technical");
});

test("removes internal source excerpts from public draft candidates", () => {
  const prepared = prepareCandidate(
    candidate({
      title: "Enterprise AI budgets change",
      url: "https://example.com/story",
      sourceId: "tldr-ai",
      sourceName: "TLDR AI",
      sourceUrl: "https://tldr.tech/ai/2026-07-22",
    }),
  );
  const safe = publicCandidate({
    ...prepared,
    preliminaryTitle: false,
  });

  assert.equal("editorialText" in safe, false);
  assert.equal("preliminaryTitle" in safe, false);
  assert.equal(safe.summaryStatus, "not-generated");
});
