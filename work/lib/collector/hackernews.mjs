import { load } from "cheerio";
import {
  canonicalizeUrl,
  isWithinWindow,
  normalizeWhitespace,
} from "./shared.mjs";

const AI_TOPIC_PATTERN =
  /\b(?:ai|artificial intelligence|machine learning|deep learning|neural network|large language model|language model|llms?|gpt(?:-\d[\w.-]*)?|chatgpt|openai|anthropic|claude|gemini|deepmind|mistral|llama|qwen|hugging face|transformers?|diffusion model|model inference|fine[- ]tun(?:e|ing)|agentic|ai agents?|coding[- ]agents?|mcp|model context protocol|agent skills?|agents? sdk|agents? framework|agents? harness|sub-?agents?|multi-?agents?|tool calling|computer use|agent2agent|a2a|langgraph|langchain|llamaindex|crewai|pydantic ai|mastra|autogen|semantic kernel|cuda|nvidia)\b/i;

const AI_HOSTS = new Set([
  "ai.google.dev",
  "anthropic.com",
  "blog.google",
  "chatgpt.com",
  "claude.com",
  "deepmind.google",
  "huggingface.co",
  "mistral.ai",
  "openai.com",
  "qwen.ai",
  "www.anthropic.com",
]);

function plainText(value) {
  if (!value) return "";
  const $ = load(`<main>${value}</main>`);
  return normalizeWhitespace($("main").text());
}

function storyUrl(story) {
  const external = canonicalizeUrl(story.url);
  return (
    external ??
    `https://news.ycombinator.com/item?id=${encodeURIComponent(story.objectID)}`
  );
}

export function isAiRelevantHackerNewsStory(story) {
  const title = normalizeWhitespace(story.title ?? "");
  if (AI_TOPIC_PATTERN.test(title)) return true;

  try {
    return AI_HOSTS.has(new URL(story.url).hostname.toLocaleLowerCase());
  } catch {
    return false;
  }
}

export function parseHackerNewsResponse(json) {
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  if (!parsed || !Array.isArray(parsed.hits)) {
    throw new Error("Hacker News response does not contain a hits array");
  }
  return {
    hits: parsed.hits,
    page: Number(parsed.page ?? 0),
    totalPages: Math.max(1, Number(parsed.nbPages ?? 1)),
  };
}

function requestUrl(source, { startEpoch, endEpoch, page }) {
  const url = new URL(source.apiUrl);
  url.searchParams.set("tags", "story");
  url.searchParams.set(
    "numericFilters",
    [
      `created_at_i>${startEpoch}`,
      `created_at_i<=${endEpoch}`,
      `points>=${source.minPoints ?? 20}`,
    ].join(","),
  );
  url.searchParams.set("hitsPerPage", String(source.hitsPerPage ?? 500));
  url.searchParams.set("page", String(page));
  return url.toString();
}

export async function collectHackerNews({
  source,
  asOf,
  lookbackDays,
  fetchText,
}) {
  const health = {
    id: source.id,
    name: source.name,
    role: source.role,
    kind: source.kind,
    status: "healthy",
    requests: 0,
    fetchedItems: 0,
    acceptedCandidates: 0,
    discardedItems: 0,
    errors: [],
  };
  const endEpoch = Math.floor(new Date(asOf).valueOf() / 1000);
  const startEpoch = endEpoch - Math.ceil(lookbackDays * 86_400);
  const stories = [];
  let page = 0;
  let totalPages = 1;

  do {
    const url = requestUrl(source, { startEpoch, endEpoch, page });
    const response = await fetchText(url);
    health.requests += 1;
    const parsed = parseHackerNewsResponse(response.text);
    stories.push(...parsed.hits);
    totalPages = parsed.totalPages;
    page += 1;
  } while (page < totalPages && page < (source.maxPages ?? 2));

  const uniqueStories = [
    ...new Map(
      stories.map((story) => [String(story.objectID), story]),
    ).values(),
  ];
  const eligible = uniqueStories.filter((story) => {
    const publishedAt = story.created_at ?? (
      Number.isFinite(story.created_at_i)
        ? new Date(story.created_at_i * 1000).toISOString()
        : null
    );
    return (
      story.objectID &&
      story.title &&
      publishedAt &&
      isWithinWindow(publishedAt, asOf, lookbackDays) &&
      Number(story.points ?? 0) >= (source.minPoints ?? 20) &&
      isAiRelevantHackerNewsStory(story)
    );
  });

  const candidates = eligible.map((story) => {
    const discussionUrl =
      `https://news.ycombinator.com/item?id=${encodeURIComponent(story.objectID)}`;
    const publishedAt =
      story.created_at ??
      new Date(Number(story.created_at_i) * 1000).toISOString();
    const url = storyUrl(story);

    return {
      title: normalizeWhitespace(story.title),
      url,
      publishedAt,
      section: "Hacker News",
      editorialText: normalizeWhitespace(
        `${story.title} ${plainText(story.story_text ?? "")}`,
      ),
      sourceRole: source.role,
      sourceKind: source.kind,
      discussionUrl,
      engagement: {
        points: Number(story.points ?? 0),
        comments: Number(story.num_comments ?? 0),
      },
      evidenceUrls: url === discussionUrl ? [] : [url],
      sourceAttributions: [
        {
          sourceId: source.id,
          sourceName: source.name,
          sourceRole: source.role,
          sourceKind: source.kind,
          sourceUrl: discussionUrl,
          section: "Community discussion",
          vendor: null,
        },
      ],
    };
  });

  health.fetchedItems = uniqueStories.length;
  health.acceptedCandidates = candidates.length;
  health.discardedItems = Math.max(
    0,
    uniqueStories.length - candidates.length,
  );
  return { candidates, health };
}
