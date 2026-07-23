import { load } from "cheerio";
import {
  canonicalizeUrl,
  isWithinWindow,
  normalizeWhitespace,
  parseIsoDate,
} from "./shared.mjs";

const MONTHS = new Map(
  [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].map((month, index) => [month, index + 1]),
);

function parseNewsroomDate(value) {
  const match = normalizeWhitespace(value).match(
    /\b([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})\b/,
  );
  if (!match || !MONTHS.has(match[1])) return null;
  return `${match[3]}-${String(MONTHS.get(match[1])).padStart(2, "0")}-${match[2].padStart(2, "0")}T12:00:00.000Z`;
}

function cardTitle(anchor) {
  const heading = normalizeWhitespace(anchor.find("h2, h3").first().text());
  if (heading) return heading;

  const labelled = normalizeWhitespace(
    anchor
      .find(
        '[class*="__title"], [class*="_title"], [class*="Title"], [class*="title"]',
      )
      .last()
      .text(),
  );
  if (labelled) return labelled;

  const clone = anchor.clone();
  clone.find("time, [class*='subject'], [class*='category']").remove();
  return normalizeWhitespace(clone.text());
}

export function parseAnthropicNewsroom(html, baseUrl) {
  const $ = load(html);
  const unique = new Map();

  $('a[href*="/news/"]').each((_, element) => {
    const anchor = $(element);
    const url = canonicalizeUrl(anchor.attr("href"), baseUrl);
    if (!url || new URL(url).hostname !== "www.anthropic.com") return;

    const rawText = normalizeWhitespace(anchor.text());
    const publishedAt = parseNewsroomDate(
      anchor.find("time").first().text() || rawText,
    );
    const title = cardTitle(anchor);
    const category = normalizeWhitespace(
      anchor
        .find('[class*="subject"], [class*="category"]')
        .first()
        .text(),
    );

    if (!title || !publishedAt) return;
    unique.set(url, {
      title,
      url,
      publishedAt,
      category: category || "Anthropic News",
    });
  });

  return [...unique.values()].sort(
    (left, right) => new Date(right.publishedAt) - new Date(left.publishedAt),
  );
}

export function parseAnthropicArticle(html) {
  const $ = load(html);
  const normalizedHtml = html.replaceAll('\\"', '"');
  const publishedMatch = normalizedHtml.match(
    /"publishedOn"\s*:\s*"([^"]+)"/,
  );

  return {
    title: normalizeWhitespace($("h1").first().text()),
    description: normalizeWhitespace(
      $('meta[name="description"]').attr("content") ??
        $('meta[property="og:description"]').attr("content") ??
        "",
    ),
    publishedAt:
      parseIsoDate(
        $('meta[property="article:published_time"]').attr("content") ??
          $("time[datetime]").first().attr("datetime") ??
          publishedMatch?.[1],
      ) ?? null,
  };
}

export async function collectAnthropic({
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

  const response = await fetchText(source.url);
  health.requests += 1;
  const entries = parseAnthropicNewsroom(response.text, source.url);
  const eligible = entries
    .filter((entry) =>
      isWithinWindow(entry.publishedAt, asOf, lookbackDays),
    )
    .slice(0, source.maxItems ?? 50);

  const candidates = eligible.map((entry) => ({
    title: entry.title,
    url: entry.url,
    publishedAt: entry.publishedAt,
    section: entry.category,
    editorialText: `${entry.title} ${entry.category}`,
    sourceRole: source.role,
    sourceKind: source.kind,
    vendor: source.vendor ?? "anthropic",
    evidenceUrls: [entry.url],
    flags: {
      vendorOwned: true,
    },
    sourceAttributions: [
      {
        sourceId: source.id,
        sourceName: source.name,
        sourceRole: source.role,
        sourceKind: source.kind,
        sourceUrl: entry.url,
        section: entry.category,
        vendor: source.vendor ?? "anthropic",
      },
    ],
  }));

  health.fetchedItems = entries.length;
  health.acceptedCandidates = candidates.length;
  health.discardedItems = Math.max(0, entries.length - candidates.length);
  return { candidates, health };
}

export async function enrichAnthropicCandidate(candidate, fetchText) {
  const attribution = candidate.sourceAttributions.find(
    ({ sourceId }) => sourceId === "anthropic-news",
  );
  if (!attribution) return candidate;

  const response = await fetchText(attribution.sourceUrl);
  const article = parseAnthropicArticle(response.text);

  return {
    ...candidate,
    title: article.title || candidate.title,
    publishedAt: article.publishedAt || candidate.publishedAt,
    editorialText: normalizeWhitespace(
      `${article.title || candidate.title} ${article.description} ${candidate.section}`,
    ),
  };
}
