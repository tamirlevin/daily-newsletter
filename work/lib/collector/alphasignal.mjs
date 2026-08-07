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
  "calendly.com",
  "forms.gle",
  "tally.so",
  "www.alphasignal.ai",
  "www.googletagmanager.com",
  "googletagmanager.com",
]);

function isNonEvidenceHost(hostname) {
  const host = hostname.toLocaleLowerCase();
  return (
    EXCLUDED_EXTERNAL_HOSTS.has(host) ||
    host === "typeform.com" ||
    host.endsWith(".typeform.com")
  );
}

function isAlphaSocialProfile(url) {
  const host = url.hostname.toLocaleLowerCase();
  const path = url.pathname.toLocaleLowerCase();
  return (
    ((host === "x.com" || host === "twitter.com") &&
      (path.includes("alphasignal") || path.startsWith("/intent/"))) ||
    (host.endsWith("linkedin.com") &&
      (path.includes("alphasignal") || path.startsWith("/sharing/")))
  );
}

function evidenceTokens(value) {
  return new Set(
    normalizeWhitespace(value)
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((token) => token.length > 2),
  );
}

function evidenceRelevance(title, anchorText, value) {
  const titleTokens = evidenceTokens(title);
  let urlText = "";
  let pathBonus = 0;
  try {
    const url = new URL(value);
    urlText = `${url.hostname} ${decodeURIComponent(url.pathname)}`;
    if (
      /\/(?:article|articles|blog|changelog|news|post|posts|press|research)(?:\/|$)/i.test(
        url.pathname,
      )
    ) {
      pathBonus += 4;
    }
    if (
      url.hostname.toLocaleLowerCase().replace(/^www\./, "") ===
        "huggingface.co" &&
      url.pathname.toLocaleLowerCase().startsWith("/spaces/")
    ) {
      pathBonus -= 8;
    }
  } catch {
    // Invalid URLs are filtered before this scorer runs.
  }
  const linkTokens = evidenceTokens(`${anchorText} ${urlText}`);
  return (
    [...titleTokens].filter((token) => linkTokens.has(token)).length +
    pathBonus
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
  const externalLinks = new Map();

  $("main a[href], article a[href], body a[href]").each((_, element) => {
    const value = canonicalizeUrl($(element).attr("href"), articleUrl);
    if (!value) return;

    const url = new URL(value);
    if (
      isNonEvidenceHost(url.hostname) ||
      isAlphaSocialProfile(url) ||
      /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(url.pathname)
    ) {
      return;
    }

    const anchorText = normalizeWhitespace($(element).text());
    const existing = externalLinks.get(value);
    if (existing) {
      existing.anchorText = normalizeWhitespace(
        `${existing.anchorText} ${anchorText}`,
      );
      return;
    }
    externalLinks.set(value, {
      url: value,
      anchorText,
      index: externalLinks.size,
    });
  });

  const externalUrls = [...externalLinks.values()]
    .sort(
      (left, right) =>
        evidenceRelevance(title, right.anchorText, right.url) -
          evidenceRelevance(title, left.anchorText, left.url) ||
        left.index - right.index,
    )
    .map(({ url }) => url);

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
