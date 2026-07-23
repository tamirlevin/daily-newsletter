import { load } from "cheerio";
import { XMLParser } from "fast-xml-parser";
import {
  asArray,
  canonicalizeUrl,
  isWithinWindow,
  normalizeWhitespace,
  parseIsoDate,
  titleFromUrl,
} from "./shared.mjs";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  processEntities: false,
  trimValues: true,
});

const EXCLUDED_EXTERNAL_HOSTS = new Set([
  "alphasignal.ai",
  "www.alphasignal.ai",
  "www.googletagmanager.com",
  "googletagmanager.com",
]);

function isAlphaSocialProfile(url) {
  const host = url.hostname.toLocaleLowerCase();
  const path = url.pathname.toLocaleLowerCase();
  return (
    ((host === "x.com" || host === "twitter.com") &&
      path.includes("alphasignal")) ||
    (host.endsWith("linkedin.com") && path.includes("alphasignal"))
  );
}

function isSpecificEvidenceUrl(value) {
  const url = new URL(value);
  const host = url.hostname.toLocaleLowerCase();
  const path = url.pathname.replace(/\/+$/, "");

  if (host === "x.com" || host === "twitter.com") {
    return /\/status\/\d+/i.test(path);
  }

  return path.length > 1 || url.search.length > 1;
}

export function parseAlphaSitemap(xml, { asOf, lookbackDays, maxEntries = 120 }) {
  const parsed = xmlParser.parse(xml);
  return asArray(parsed?.urlset?.url)
    .map((entry) => ({
      url: canonicalizeUrl(entry.loc),
      publishedAt: parseIsoDate(entry.lastmod),
    }))
    .filter(
      (entry) =>
        entry.url &&
        entry.publishedAt &&
        isWithinWindow(entry.publishedAt, asOf, lookbackDays),
    )
    .slice(0, maxEntries)
    .map((entry) => ({
      ...entry,
      title: titleFromUrl(entry.url),
      preliminaryTitle: true,
      section: "AlphaSignal Editorial",
      editorialText: titleFromUrl(entry.url),
    }));
}

export function parseAlphaArticle(html, articleUrl) {
  const $ = load(html);
  const title = normalizeWhitespace($("h1").first().text());
  const description = normalizeWhitespace(
    $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content") ??
      "",
  );
  const externalUrls = [];

  $("main a[href], article a[href], body a[href]").each((_, element) => {
    const value = canonicalizeUrl($(element).attr("href"), articleUrl);
    if (!value) return;

    const url = new URL(value);
    if (
      EXCLUDED_EXTERNAL_HOSTS.has(url.hostname.toLocaleLowerCase()) ||
      isAlphaSocialProfile(url) ||
      /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(url.pathname)
    ) {
      return;
    }

    if (!externalUrls.includes(value)) externalUrls.push(value);
  });

  return {
    title,
    description,
    externalUrls,
  };
}

export async function collectAlphaSignal({
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

  const sitemapResponse = await fetchText(source.sitemapUrl);
  health.requests += 1;
  const sitemapCandidates = parseAlphaSitemap(sitemapResponse.text, {
    asOf,
    lookbackDays,
    maxEntries: source.maxEntries,
  });
  health.fetchedItems = sitemapCandidates.length;

  const candidates = sitemapCandidates.map((candidate) => ({
    ...candidate,
    sourceRole: source.role,
    sourceKind: source.kind,
    sourceAttributions: [
      {
        sourceId: source.id,
        sourceName: source.name,
        sourceRole: source.role,
        sourceKind: source.kind,
        sourceUrl: candidate.url,
        section: candidate.section,
        vendor: source.vendor ?? null,
      },
    ],
  }));

  health.acceptedCandidates = candidates.length;
  if (candidates.length === 0) health.status = "failed";
  return { candidates, health };
}

export async function enrichAlphaCandidate(candidate, fetchText) {
  const articleUrl =
    candidate.sourceAttributions.find(
      (attribution) => attribution.sourceId === "alphasignal",
    )?.sourceUrl ?? candidate.url;
  const response = await fetchText(articleUrl);
  const article = parseAlphaArticle(response.text, articleUrl);
  const preferredUrl =
    article.externalUrls.find(isSpecificEvidenceUrl) ?? candidate.url;

  return {
    ...candidate,
    title: article.title || candidate.title,
    preliminaryTitle: false,
    url: preferredUrl,
    canonicalUrl: canonicalizeUrl(preferredUrl),
    originalDomain: new URL(preferredUrl).hostname.toLocaleLowerCase(),
    editorialText: normalizeWhitespace(
      `${article.title || candidate.title} ${article.description}`,
    ),
    evidenceUrls: article.externalUrls.slice(0, 3),
  };
}
