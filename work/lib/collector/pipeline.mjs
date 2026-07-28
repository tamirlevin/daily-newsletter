import {
  collectAlphaSignal,
  enrichAlphaCandidate,
} from "./alphasignal.mjs";
import {
  collectAnthropic,
  enrichAnthropicCandidate,
} from "./anthropic.mjs";
import {
  computeMixQuotas,
  countEditorialMix,
  dedupeCandidates,
  isPublicationEligibleCandidate,
  scoreCandidate,
  selectEditorialMix,
} from "./editorial.mjs";
import { fetchText as defaultFetchText, resolveTrackingUrl } from "./network.mjs";
import { collectHackerNews } from "./hackernews.mjs";
import { collectHuggingFace } from "./huggingface.mjs";
import { collectOfficialRss } from "./official-rss.mjs";
import {
  canonicalizeUrl,
  localDateKey,
  mapWithConcurrency,
  publicCandidate,
} from "./shared.mjs";
import { collectTldr } from "./tldr.mjs";
import {
  normalizeCadence,
  runIdFor,
} from "../briefing-profiles.mjs";
import { load } from "cheerio";

function failedHealth(source, error) {
  return {
    id: source.id,
    name: source.name,
    role: source.role,
    kind: source.kind,
    status: "failed",
    requests: 1,
    fetchedItems: 0,
    acceptedCandidates: 0,
    discardedItems: 0,
    errors: [{
      url:
        source.feedUrl ??
        source.sitemapUrl ??
        source.apiUrl ??
        source.url,
      message: error.message,
    }],
  };
}

function sourceCollector(source) {
  if (source.type === "tldr") return collectTldr;
  if (source.type === "alphasignal") return collectAlphaSignal;
  if (source.type === "official-rss") return collectOfficialRss;
  if (source.type === "anthropic") return collectAnthropic;
  if (source.type === "hackernews") return collectHackerNews;
  if (source.type === "huggingface-papers") return collectHuggingFace;
  throw new Error(`Unsupported source type: ${source.type}`);
}

function updateEnrichmentHealth(health, sourceId, error) {
  const source = health.find((entry) => entry.id === sourceId);
  if (!source) return;
  source.status = source.status === "failed" ? "failed" : "degraded";
  source.errors.push({
    stage: "enrichment",
    message: error.message,
  });
}

async function enrichCandidate(
  candidate,
  {
    fetchText,
    health,
  },
) {
  let enriched = candidate;
  const attributionIds = new Set(
    candidate.sourceAttributions.map(({ sourceId }) => sourceId),
  );

  if (attributionIds.has("alphasignal")) {
    const alphaHealth = health.find((entry) => entry.id === "alphasignal");
    try {
      enriched = await enrichAlphaCandidate(enriched, fetchText);
      if (alphaHealth) alphaHealth.requests += 1;
    } catch (error) {
      if (alphaHealth) alphaHealth.requests += 1;
      updateEnrichmentHealth(health, "alphasignal", error);
    }
  }

  if (attributionIds.has("anthropic-news")) {
    const anthropicHealth = health.find(
      (entry) => entry.id === "anthropic-news",
    );
    try {
      enriched = await enrichAnthropicCandidate(enriched, fetchText);
      if (anthropicHealth) anthropicHealth.requests += 1;
    } catch (error) {
      if (anthropicHealth) anthropicHealth.requests += 1;
      updateEnrichmentHealth(health, "anthropic-news", error);
    }
  }

  const trackingHosts = new Set([
    "a.tldrnewsletter.com",
    "links.tldrnewsletter.com",
  ]);
  let host = "";
  try {
    host = new URL(enriched.url).hostname.toLocaleLowerCase();
  } catch {
    return enriched;
  }

  if (trackingHosts.has(host)) {
    const tldrHealth = health.find((entry) => entry.id === "tldr-ai");
    try {
      const resolved = await resolveTrackingUrl(enriched.url);
      if (tldrHealth) tldrHealth.requests += 1;
      if (resolved) {
        enriched = {
          ...enriched,
          url: resolved,
          canonicalUrl: canonicalizeUrl(resolved),
          originalDomain: new URL(resolved).hostname.toLocaleLowerCase(),
        };
      }
    } catch (error) {
      if (tldrHealth) tldrHealth.requests += 1;
      updateEnrichmentHealth(health, "tldr-ai", error);
    }
  }

  return enriched;
}

function evidenceTextFromHtml(html) {
  const $ = load(html);
  const candidates = [
    $('meta[name="citation_abstract"]').attr("content"),
    $('meta[property="og:description"]').attr("content"),
    $('meta[name="description"]').attr("content"),
    $('meta[name="twitter:description"]').attr("content"),
  ];

  $("script[type='application/ld+json']").each((_, element) => {
    try {
      const parsed = JSON.parse($(element).text());
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        if (typeof entry?.description === "string") {
          candidates.push(entry.description);
        }
      }
    } catch {
      // Invalid publisher JSON-LD is ignored in favour of other evidence.
    }
  });

  const paragraphs = $("article p, main p")
    .map((_, element) => $(element).text())
    .get()
    .map((value) => String(value).replace(/\s+/g, " ").trim())
    .filter((value) => value.split(" ").length >= 12)
    .slice(0, 3);
  candidates.push(...paragraphs);

  return [...new Set(
    candidates
      .map((value) => String(value ?? "").replace(/\s+/g, " ").trim())
      .filter((value) => value.split(" ").length >= 12),
  )]
    .join(" ")
    .slice(0, 5_000);
}

async function addSummaryEvidence(candidate, fetchText) {
  try {
    const response = await fetchText(candidate.url);
    const evidenceText = evidenceTextFromHtml(response.text);
    return evidenceText
      ? { ...candidate, summaryEvidenceText: evidenceText }
      : candidate;
  } catch {
    return candidate;
  }
}

function validatePolicy(config) {
  const ratioTotal = Object.values(config.editorialMix).reduce(
    (total, value) => total + value,
    0,
  );
  if (Math.abs(ratioTotal - 1) > 0.0001) {
    throw new Error("Editorial mix must add up to 1");
  }
  if (!Number.isInteger(config.maxItems) || config.maxItems < 1) {
    throw new Error("maxItems must be a positive integer");
  }
  if (
    !config.sourceSignals?.discoveryWeight ||
    !config.sourceSignals?.evidenceAuthority
  ) {
    throw new Error(
      "sourceSignals must define discoveryWeight and evidenceAuthority",
    );
  }
}

function isDirectXLink(candidate) {
  try {
    const host = new URL(candidate.url).hostname.toLocaleLowerCase();
    return host === "x.com" || host === "twitter.com";
  } catch {
    return false;
  }
}

export async function collectBrief({
  config,
  cadence = "weekly",
  asOf = new Date(),
  lookbackDays,
  maxItems,
  excludedUrls = [],
  fetchText = defaultFetchText,
  summarizeCandidates,
}) {
  const normalizedCadence = normalizeCadence(cadence);
  const cadenceProfile = config.cadences?.[normalizedCadence];
  if (!cadenceProfile) {
    throw new Error(
      `Missing editorial configuration for ${normalizedCadence}`,
    );
  }
  const resolvedLookbackDays = lookbackDays ?? cadenceProfile.lookbackDays;
  const resolvedMaxItems = maxItems ?? cadenceProfile.maxItems;
  const editorialMix = cadenceProfile.editorialMix;
  validatePolicy({
    ...config,
    editorialMix,
    maxItems: resolvedMaxItems,
  });
  const normalizedAsOf = new Date(asOf);
  if (Number.isNaN(normalizedAsOf.valueOf())) {
    throw new Error(`Invalid as-of date: ${asOf}`);
  }

  const enabledSources = config.sources.filter((source) => source.enabled);
  const sourceResults = await Promise.all(
    enabledSources.map(async (source) => {
      try {
        return await sourceCollector(source)({
          source,
          asOf: normalizedAsOf,
          lookbackDays: resolvedLookbackDays,
          concurrency: config.requestConcurrency,
          fetchText,
        });
      } catch (error) {
        return {
          candidates: [],
          health: failedHealth(source, error),
        };
      }
    }),
  );

  const health = sourceResults.map(({ health: sourceHealth }) => sourceHealth);
  const rawCandidates = sourceResults.flatMap(({ candidates }) => candidates);
  if (rawCandidates.length === 0) {
    throw new Error("All configured sources failed or returned no candidates");
  }
  const excludedCanonicalUrls = new Set(
    excludedUrls
      .map((url) => canonicalizeUrl(url))
      .filter(Boolean),
  );
  const isExcluded = (candidate) =>
    excludedCanonicalUrls.has(
      canonicalizeUrl(candidate.canonicalUrl ?? candidate.url),
    );
  const eligibleCandidates = rawCandidates.filter(
    (candidate) => !isExcluded(candidate),
  );
  if (eligibleCandidates.length === 0) {
    throw new Error(
      "All collected candidates were already used in recent runs",
    );
  }

  const preliminary = dedupeCandidates(eligibleCandidates, {
    fuzzy: false,
  }).map((candidate) => scoreCandidate(candidate, config, normalizedAsOf));
  const enrichmentPoolSize = Math.min(
    preliminary.length,
    Math.max(
      resolvedMaxItems,
      resolvedMaxItems * (config.enrichmentPoolMultiplier ?? 3),
    ),
  );
  const enrichmentPool = selectEditorialMix(
    preliminary,
    enrichmentPoolSize,
    editorialMix,
    config.selectionRules,
  );
  const enriched = await mapWithConcurrency(
    enrichmentPool,
    config.requestConcurrency,
    (candidate) => enrichCandidate(candidate, { fetchText, health }),
  );
  const rescored = dedupeCandidates(enriched, { fuzzy: true })
    .filter((candidate) => !isExcluded(candidate))
    .map((candidate) => scoreCandidate(candidate, config, normalizedAsOf));
  const publicationEligible = rescored.filter(
    isPublicationEligibleCandidate,
  );
  const selected = selectEditorialMix(
    publicationEligible,
    resolvedMaxItems,
    editorialMix,
    {
      ...config.selectionRules,
      preserveEditorialMix: true,
    },
  );
  const expectedMix = computeMixQuotas(resolvedMaxItems, editorialMix);
  const selectedMix = countEditorialMix(selected);
  if (
    selected.length !== resolvedMaxItems ||
    Object.entries(expectedMix).some(
      ([lane, expected]) => selectedMix[lane] !== expected,
    )
  ) {
    const availableMix = countEditorialMix(publicationEligible);
    throw new Error(
      `Unable to satisfy ${normalizedCadence} editorial mix. ` +
      `Required ${JSON.stringify(expectedMix)}; ` +
      `available publishable candidates ${JSON.stringify(availableMix)}.`,
    );
  }
  let selectedWithSummaries = selected.map((candidate) => ({
    ...candidate,
    summaryStatus: "unavailable",
  }));
  if (summarizeCandidates) {
    const withEvidence = await mapWithConcurrency(
      selected,
      config.requestConcurrency,
      (candidate) => addSummaryEvidence(candidate, fetchText),
    );
    let summaries;
    try {
      summaries = await summarizeCandidates(withEvidence);
      if (
        !Array.isArray(summaries) ||
        summaries.length !== withEvidence.length
      ) {
        throw new Error("Summary generation returned the wrong story count");
      }
    } catch {
      summaries = withEvidence.map(() => null);
    }
    selectedWithSummaries = withEvidence.map((candidate, index) => {
      const briefSummary =
        typeof summaries[index] === "string" && summaries[index].trim()
          ? summaries[index].trim()
          : null;
      return {
        ...candidate,
        ...(briefSummary ? { briefSummary } : {}),
        summaryStatus: briefSummary ? "generated" : "unavailable",
      };
    });
  }
  for (const sourceHealth of health) {
    sourceHealth.selectedCandidates = selectedWithSummaries.filter((candidate) =>
      candidate.sourceAttributions.some(
        ({ sourceId }) => sourceId === sourceHealth.id,
      ),
    ).length;
  }

  const status = health.every((source) => source.status === "healthy")
    ? "healthy"
    : health.some((source) => source.status !== "failed")
      ? "degraded"
      : "failed";
  const generatedAt = normalizedAsOf.toISOString();
  const periodStart = new Date(normalizedAsOf);
  periodStart.setUTCDate(
    periodStart.getUTCDate() - resolvedLookbackDays,
  );
  const issueDate = localDateKey(normalizedAsOf, config.timeZone);
  const runId = runIdFor(normalizedCadence, issueDate);

  const healthReport = {
    schemaVersion: 2,
    kind: "source-health",
    cadence: normalizedCadence,
    runId,
    status,
    generatedAt,
    period: {
      start: periodStart.toISOString(),
      end: generatedAt,
      lookbackDays: resolvedLookbackDays,
    },
    sources: health,
    totals: {
      rawCandidates: rawCandidates.length,
      excludedFromRecentRuns:
        rawCandidates.length - eligibleCandidates.length,
      preliminaryCandidates: preliminary.length,
      enrichmentPoolCandidates: enrichmentPool.length,
      postEnrichmentCandidates: rescored.length,
      publicationEligibleCandidates: publicationEligible.length,
      rejectedPublicationCandidates:
        rescored.length - publicationEligible.length,
      selectedCandidates: selectedWithSummaries.length,
      selectedWithPrimaryEvidence: selectedWithSummaries.filter(
        (candidate) =>
          (candidate.sourceSignals?.evidenceAuthority ?? 0) >= 0.9,
      ).length,
      selectedAcrossMultipleDiscoveryChannels: selectedWithSummaries.filter(
        (candidate) =>
          (candidate.sourceSignals?.discoverySourceCount ?? 0) > 1,
      ).length,
      selectedNeedingPrimaryEvidenceReview: selectedWithSummaries.filter(
        (candidate) => candidate.flags?.needsPrimaryEvidenceReview,
      ).length,
      directXLinksInRawCandidates:
        eligibleCandidates.filter(isDirectXLink).length,
      directXLinksInSelection:
        selectedWithSummaries.filter(isDirectXLink).length,
      generatedSummaries: selectedWithSummaries.filter(
        (candidate) => candidate.summaryStatus === "generated",
      ).length,
      unavailableSummaries: selectedWithSummaries.filter(
        (candidate) => candidate.summaryStatus === "unavailable",
      ).length,
    },
  };

  const draft = {
    schemaVersion: 3,
    kind: "collection-draft",
    cadence: normalizedCadence,
    runId,
    issueDate,
    generatedAt,
    status: "ready-to-publish",
    period: healthReport.period,
    editorialPolicy: {
      profile: normalizedCadence,
      targetMix: editorialMix,
      selectedMix: countEditorialMix(selectedWithSummaries),
      sourceSignals: config.sourceSignals,
      selectionRules: config.selectionRules,
      note:
        "Newsletters, Hacker News, and Hugging Face are discovery signals. Official lab sources are primary evidence, not independent corroboration. Published copy must be written independently.",
      directXCoverage: {
        capturedFromConfiguredSources:
          healthReport.totals.directXLinksInRawCandidates,
        selected: healthReport.totals.directXLinksInSelection,
        directIngestionStatus: "not-configured",
      },
    },
    sourceHealth: {
      status,
      healthySources: health.filter((source) => source.status === "healthy")
        .length,
      configuredSources: health.length,
      summaryCoverage: {
        generated: healthReport.totals.generatedSummaries,
        unavailable: healthReport.totals.unavailableSummaries,
      },
    },
    items: selectedWithSummaries.map(publicCandidate),
  };

  return { draft, healthReport };
}
