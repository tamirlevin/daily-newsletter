import { load } from "cheerio";
import { XMLParser } from "fast-xml-parser";
import {
  asArray,
  canonicalizeUrl,
  isWithinWindow,
  normalizeWhitespace,
  parseIsoDate,
} from "./shared.mjs";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  processEntities: false,
  trimValues: true,
});

function textValue(value) {
  if (typeof value === "string" || typeof value === "number") {
    return normalizeWhitespace(value);
  }
  if (!value || typeof value !== "object") return "";
  return normalizeWhitespace(value["#text"] ?? value["@_term"] ?? "");
}

function itemLink(value) {
  for (const link of asArray(value)) {
    if (typeof link === "string") return link;
    if (!link || typeof link !== "object") continue;
    if (!link["@_rel"] || link["@_rel"] === "alternate") {
      return link["@_href"] ?? link["#text"] ?? null;
    }
  }
  return null;
}

function htmlToText(value) {
  if (!value) return "";
  const $ = load(`<main>${String(value)}</main>`);
  const decoded = $("main").text();
  const decodedHtml = load(`<main>${decoded}</main>`);
  return normalizeWhitespace(decodedHtml("main").text());
}

function contentValue(value) {
  if (typeof value === "string" || typeof value === "number") return value;
  if (!value || typeof value !== "object") return "";
  return value["#text"] ?? "";
}

function matchesAny(value, patterns = []) {
  return patterns.some((pattern) => new RegExp(pattern, "i").test(value));
}

function isEligibleItem(item, source) {
  if (matchesAny(item.title, source.excludeTitlePatterns)) return false;
  if (
    (source.requireContentPatterns?.length ?? 0) > 0 &&
    !matchesAny(
      `${item.title} ${item.description}`,
      source.requireContentPatterns,
    )
  ) {
    return false;
  }

  const includesConfigured =
    (source.includeCategoryPatterns?.length ?? 0) > 0 ||
    (source.includeUrlPatterns?.length ?? 0) > 0 ||
    (source.includeTitlePatterns?.length ?? 0) > 0;
  if (!includesConfigured) return true;

  return (
    item.categories.some((category) =>
      matchesAny(category, source.includeCategoryPatterns),
    ) ||
    matchesAny(item.url, source.includeUrlPatterns) ||
    matchesAny(item.title, source.includeTitlePatterns)
  );
}

export function parseOfficialFeed(xml) {
  const parsed = xmlParser.parse(xml);
  const rawItems = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];

  return asArray(rawItems)
    .map((item) => {
      const rawDescription =
        item.description ??
        item.summary ??
        item.content?.["#text"] ??
        item["content:encoded"] ??
        "";
      const categories = asArray(item.category)
        .map(textValue)
        .filter(Boolean);

      return {
        title: textValue(item.title),
        url: canonicalizeUrl(itemLink(item.link)),
        publishedAt: parseIsoDate(
          item.pubDate ?? item.published ?? item.updated,
        ),
        description: htmlToText(contentValue(rawDescription)),
        categories,
      };
    })
    .filter((item) => item.title && item.url && item.publishedAt);
}

export async function collectOfficialRss({
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

  const response = await fetchText(source.feedUrl);
  health.requests += 1;
  const feedItems = parseOfficialFeed(response.text);
  const eligible = feedItems.filter(
    (item) =>
      isWithinWindow(item.publishedAt, asOf, lookbackDays) &&
      isEligibleItem(item, source),
  );
  const limited = eligible.slice(0, source.maxItems ?? 100);

  const candidates = limited.map((item) => ({
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    section: item.categories[0] ?? source.defaultSection ?? source.name,
    editorialText: normalizeWhitespace(
      `${item.title} ${item.description} ${item.categories.join(" ")}`,
    ),
    sourceRole: source.role,
    sourceKind: source.kind,
    vendor: source.vendor ?? null,
    evidenceUrls: [item.url],
    flags: {
      vendorOwned: source.kind === "primary",
    },
    sourceAttributions: [
      {
        sourceId: source.id,
        sourceName: source.name,
        sourceRole: source.role,
        sourceKind: source.kind,
        sourceUrl: item.url,
        section: item.categories[0] ?? source.defaultSection ?? source.name,
        vendor: source.vendor ?? null,
      },
    ],
  }));

  health.fetchedItems = feedItems.length;
  health.acceptedCandidates = candidates.length;
  health.discardedItems = Math.max(0, feedItems.length - candidates.length);
  return { candidates, health };
}
