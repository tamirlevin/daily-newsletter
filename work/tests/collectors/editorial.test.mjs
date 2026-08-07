import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyLane,
  computeMixQuotas,
  dedupeCandidates,
  isPublicationEligibleCandidate,
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
  assert.equal(
    canonicalizeUrl(
      "https://example.com/story?amp;utm_source=infoq&amp;utm_medium=feed",
    ),
    "https://example.com/story",
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

  const acquisition = dedupeCandidates([
    candidate({
      title: "AMD acquires Taalas to build chips for one AI model",
      url: "https://example.com/amd-taalas",
      sourceId: "alphasignal",
      sourceName: "AlphaSignal",
      sourceUrl: "https://alphasignal.ai/news/amd-acquires-taalas",
    }),
    candidate({
      title: "AMD acquires Taalas to boost inference performance",
      url: "https://example.net/taalas-acquisition",
      sourceId: "hacker-news",
      sourceName: "Hacker News",
      sourceUrl: "https://news.ycombinator.com/item?id=42",
    }),
  ]);
  assert.equal(acquisition.length, 1);
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

test("does not treat a primary-only feed as independent discovery", () => {
  const [prepared] = dedupeCandidates([
    {
      title: "OpenAI launches a new enterprise agent control",
      url: "https://openai.com/example/agent-control",
      publishedAt: "2026-07-22T00:00:00.000Z",
      section: "Product",
      editorialText: "A primary product announcement for enterprise teams.",
      sourceRole: "official-lab",
      sourceKind: "primary",
      vendor: "openai",
      sourceAttributions: [
        {
          sourceId: "openai-news",
          sourceName: "OpenAI News",
          sourceRole: "official-lab",
          sourceKind: "primary",
          sourceUrl: "https://openai.com/example/agent-control",
          vendor: "openai",
        },
      ],
    },
  ]);
  const scored = scoreCandidate(
    prepared,
    {
      sourceSignals: {
        discoveryWeight: { "official-lab": 0.3 },
        evidenceAuthority: { "official-lab": 1 },
      },
    },
    new Date("2026-07-23T00:00:00.000Z"),
  );

  assert.equal(scored.sourceSignals.discoveryWeight, 0);
  assert.equal(scored.sourceSignals.evidenceAuthority, 1);
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

test("enforces the 70/20/10 executive, technical, and builder allocation", () => {
  assert.deepEqual(
    computeMixQuotas(10, {
      executive: 0.7,
      technical: 0.2,
      builder: 0.1,
    }),
    { executive: 7, technical: 2, builder: 1 },
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
      id: `builder-${index}`,
      editorialLane: "builder",
      score: 60 - index,
    })),
  ];
  const selected = selectEditorialMix(candidates, 10, {
    executive: 0.7,
    technical: 0.2,
    builder: 0.1,
  });

  assert.deepEqual(
    selected.reduce(
      (counts, item) => ({
        ...counts,
        [item.editorialLane]: counts[item.editorialLane] + 1,
      }),
      { executive: 0, technical: 0, builder: 0 },
    ),
    { executive: 7, technical: 2, builder: 1 },
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
    { executive: 1, technical: 0, builder: 0 },
    { maxUncorroboratedOfficialItemsPerVendor: 1 },
  );

  assert.deepEqual(
    selected.map(({ id }) => id),
    ["openai-1", "google-1", "community-1"],
  );
});

test("keeps model-lab diversity limits hard even for discovered stories", () => {
  const labCandidate = (id, vendor, score, title = id) => ({
    id,
    title,
    editorialLane: "executive",
    score,
    vendor,
    discoverySourceCount: 1,
    primarySourceCount: 1,
    sourceAttributions: [
      {
        sourceId: "tldr-ai",
        sourceRole: "diverse-newsletter",
        sourceKind: "discovery",
      },
    ],
  });
  const selected = selectEditorialMix(
    [
      labCandidate("openai-1", "openai", 100),
      labCandidate("openai-2", null, 99, "OpenAI expands ChatGPT agents"),
      labCandidate("anthropic-1", "anthropic", 98),
      labCandidate("google-1", "google", 97),
      labCandidate("google-2", "google", 96),
    ],
    5,
    { executive: 1, technical: 0, builder: 0 },
    {
      modelLabVendors: ["openai", "anthropic", "google"],
      maxModelLabItems: 2,
      maxModelLabItemsPerVendor: 1,
      preserveEditorialMix: true,
    },
  );

  assert.deepEqual(
    selected.map(({ id }) => id),
    ["openai-1", "anthropic-1"],
  );
  assert.equal(selected.some((item) => item.flags?.selectionGuardrailRelaxed), false);
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
    { executive: 1, technical: 0, builder: 0 },
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

test("separates practical builder launches from technical and executive news", () => {
  const builder = classifyLane({
    title: "Cloudflare releases an Agents SDK with durable workflows",
    url: "https://blog.cloudflare.com/example-agents-sdk",
    section: "Agents",
    editorialText:
      "The open-source SDK is available now with MCP tools, sandboxes, and orchestration.",
    sourceAttributions: [
      {
        sourceId: "cloudflare-agents",
        sourceRole: "official-builder",
        sourceKind: "primary",
      },
    ],
  });
  const technical = classifyLane({
    title: "A new inference architecture reduces agent latency",
    url: "https://example.com/inference-architecture",
    section: "Engineering",
    editorialText:
      "The implementation changes token throughput, quantization, and benchmark performance.",
  });
  const executive = classifyLane({
    title: "MCP adoption reshapes enterprise software distribution",
    url: "https://example.com/mcp-adoption",
    section: "Analysis",
    editorialText:
      "Companies are changing platform strategy, governance, and operating workflows as the protocol becomes a standard.",
  });

  assert.equal(builder.lane, "builder");
  assert.equal(technical.lane, "technical");
  assert.equal(executive.lane, "executive");
});

test("does not reserve a lane for indexed academic papers", () => {
  const paper = classifyLane({
    title:
      "Molt: A Scalable PyTorch-Native Training Framework for Agentic Reinforcement Learning",
    url: "https://arxiv.org/abs/2607.21653",
    section: "Research Watch",
    editorialText:
      "A research paper benchmarks training throughput, inference latency, quantization, and algorithm performance.",
    sourceAttributions: [
      {
        sourceId: "huggingface-papers",
        sourceRole: "research-index",
        sourceKind: "discovery",
      },
    ],
  });

  assert.equal(paper.lane, "technical");
  assert.notEqual(paper.lane, "builder");
});

test("filters candidates that the publication gate cannot accept", () => {
  const candidate = (url, flags = {}) => ({
    url,
    flags,
  });

  assert.equal(
    isPublicationEligibleCandidate(
      candidate("https://example.com/valid"),
    ),
    true,
  );
  assert.equal(
    isPublicationEligibleCandidate(
      candidate(
        "http://microsoft.ai/news/introducing-mai-cyber-1-flash-inside-mdash",
      ),
    ),
    false,
  );
  assert.equal(
    isPublicationEligibleCandidate(
      candidate("https://example.com/hype", {
        promotionalLanguage: true,
      }),
    ),
    false,
  );
  assert.equal(
    isPublicationEligibleCandidate(
      candidate("https://example.com/unsupported", {
        needsPrimaryEvidenceReview: true,
      }),
    ),
    false,
  );
});

test("preserves exact lane quotas instead of filling from another lane", () => {
  const candidates = [
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `executive-${index}`,
      editorialLane: "executive",
      score: 100 - index,
    })),
    {
      id: "technical-0",
      editorialLane: "technical",
      score: 80,
    },
  ];

  const selected = selectEditorialMix(
    candidates,
    5,
    { executive: 0.6, technical: 0.2, builder: 0.2 },
    { preserveEditorialMix: true },
  );

  assert.deepEqual(
    selected.reduce(
      (counts, item) => ({
        ...counts,
        [item.editorialLane]: counts[item.editorialLane] + 1,
      }),
      { executive: 0, technical: 0, builder: 0 },
    ),
    { executive: 3, technical: 1, builder: 0 },
  );
  assert.equal(selected.length, 4);
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
