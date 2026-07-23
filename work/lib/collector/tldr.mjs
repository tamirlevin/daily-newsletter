import { load } from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { isPromotionalStory } from "./editorial.mjs";
import {
  asArray,
  canonicalizeUrl,
  isWithinWindow,
  mapWithConcurrency,
  normalizeWhitespace,
  parseIsoDate,
} from "./shared.mjs";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  processEntities: false,
  trimValues: true,
});

export function parseTldrFeed(xml) {
  const parsed = xmlParser.parse(xml);
  return asArray(parsed?.rss?.channel?.item)
    .map((item) => ({
      title: normalizeWhitespace(item.title),
      url: canonicalizeUrl(item.link),
      publishedAt: parseIsoDate(item.pubDate),
    }))
    .filter((item) => item.title && item.url && item.publishedAt);
}

export function parseTldrIssue(html, issue) {
  const $ = load(html);
  const stories = [];

  $("section").each((_, sectionElement) => {
    const section = normalizeWhitespace(
      $(sectionElement).find("header h3").first().text(),
    );

    $(sectionElement)
      .find("article")
      .each((__, articleElement) => {
        const article = $(articleElement);
        const heading = article.find("h3").first();
        const anchor = heading.closest("a[href]").length
          ? heading.closest("a[href]")
          : article.find("a[href]").first();
        const rawTitle = normalizeWhitespace(heading.text());
        const readingTimeMatch = rawTitle.match(
          /\s*\((\d+\s+minute read)\)\s*$/i,
        );
        const title = normalizeWhitespace(
          readingTimeMatch
            ? rawTitle.slice(0, readingTimeMatch.index)
            : rawTitle,
        );
        const editorialText = normalizeWhitespace(
          article.find(".newsletter-html").first().text(),
        );
        const url = canonicalizeUrl(anchor.attr("href"), issue.url);

        if (
          !title ||
          !url ||
          isPromotionalStory({
            title: rawTitle,
            section,
            text: editorialText,
          })
        ) {
          return;
        }

        stories.push({
          title,
          url,
          publishedAt: issue.publishedAt,
          section: section || "TLDR AI",
          editorialText,
          readingTime: readingTimeMatch?.[1] ?? null,
        });
      });
  });

  return stories;
}

export async function collectTldr({
  source,
  asOf,
  lookbackDays,
  concurrency,
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

  const feedResponse = await fetchText(source.feedUrl);
  health.requests += 1;
  const feedItems = parseTldrFeed(feedResponse.text);
  const issues = feedItems
    .filter((item) => isWithinWindow(item.publishedAt, asOf, lookbackDays))
    .slice(0, source.maxIssues ?? 5);
  health.fetchedItems = issues.length;

  const issueResults = await mapWithConcurrency(
    issues,
    concurrency,
    async (issue) => {
      try {
        const response = await fetchText(issue.url);
        health.requests += 1;
        const stories = parseTldrIssue(response.text, issue);
        return { issue, stories };
      } catch (error) {
        health.requests += 1;
        health.errors.push({
          url: issue.url,
          message: error.message,
        });
        return { issue, stories: [] };
      }
    },
  );

  const candidates = issueResults.flatMap(({ issue, stories }) =>
    stories.map((story) => ({
      ...story,
      sourceRole: source.role,
      sourceKind: source.kind,
      sourceAttributions: [
        {
          sourceId: source.id,
          sourceName: source.name,
          sourceRole: source.role,
          sourceKind: source.kind,
          sourceUrl: issue.url,
          section: story.section,
          vendor: source.vendor ?? null,
        },
      ],
    })),
  );

  health.acceptedCandidates = candidates.length;
  health.discardedItems = Math.max(0, feedItems.length - issues.length);
  if (health.errors.length > 0) health.status = "degraded";
  if (candidates.length === 0) health.status = "failed";

  return { candidates, health };
}
