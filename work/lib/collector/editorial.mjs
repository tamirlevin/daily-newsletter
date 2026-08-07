import {
  canonicalizeUrl,
  normalizeWhitespace,
  stableId,
} from "./shared.mjs";
import { identifyModelLabVendors } from "../model-labs.mjs";

const DAY_MS = 86_400_000;
const LANE_ORDER = ["executive", "technical", "builder"];
const AGGREGATOR_HOSTS = new Set([
  "alphasignal.ai",
  "ai.tldr.tech",
  "a.tldrnewsletter.com",
  "links.tldrnewsletter.com",
  "tldr.tech",
]);

const PRIMARY_VENDOR_HOSTS = new Map([
  ["ai.google.dev", "google"],
  ["anthropic.com", "anthropic"],
  ["blog.cloudflare.com", "cloudflare"],
  ["blog.google", "google"],
  ["blog.modelcontextprotocol.io", "model-context-protocol"],
  ["claude.com", "anthropic"],
  ["deepmind.google", "google"],
  ["github.blog", "github"],
  ["openai.com", "openai"],
  ["www.anthropic.com", "anthropic"],
  ["www.claude.com", "anthropic"],
  ["www.openai.com", "openai"],
]);

const PRIMARY_RESEARCH_HOSTS = new Set([
  "aclanthology.org",
  "arxiv.org",
  "openreview.net",
]);

const PROMOTIONAL_PATTERNS = [
  /\((?:sponsor|sponsored)\)/i,
  /\bsponsored\b/i,
  /\badvertorial\b/i,
  /\btldr is hiring\b/i,
  /\bwant to advertise\b/i,
  /\bmanage your subscriptions?\b/i,
  /\bjoin [\d,.+]+ readers\b/i,
  /\bapply here\b/i,
  /\bcurator\b.*\bhours?\/week\b/i,
];

const EXECUTIVE_SIGNALS = [
  {
    pattern:
      /\b(enterprise|business|company|companies|customer|workforce|workplace|economy|market|revenue|sales|spend|cost|pricing|budget)\b/i,
    weight: 1.4,
    label: "commercial or operating impact",
  },
  {
    pattern:
      /\b(acquisition|acquires?|merger|funding|deal|partnership|investment|valuation|ipo)\b/i,
    weight: 1.8,
    label: "market-moving transaction",
  },
  {
    pattern:
      /\b(government|regulation|regulator|policy|law|court|security|safety|risk|governance)\b/i,
    weight: 1.5,
    label: "policy, security, or governance impact",
  },
  {
    pattern: /\b(launch(?:es|ed)?|release[ds]?|ships?|rollout|available|announc(?:e|es|ed))\b/i,
    weight: 0.7,
    label: "material launch or availability change",
  },
  {
    pattern:
      /\b(ecosystem|platform|standard|protocol|interoperab(?:ility|le)|distribution|marketplace|agentic commerce|mcp|model context protocol)\b/i,
    weight: 1,
    label: "platform or ecosystem shift",
  },
  {
    pattern:
      /\b(adoption|production|automation|workflow|deployment|integrat(?:e|es|ed|ion|ions)|general availability)\b/i,
    weight: 0.8,
    label: "adoption or operating-model change",
  },
];

const TECHNICAL_SIGNALS = [
  {
    pattern:
      /\b(architecture|training|fine[- ]tun(?:e|ing)|inference|latency|throughput|token|context window|benchmark|evaluation|database|algorithm|quantization)\b/i,
    weight: 1.4,
    label: "technical architecture or performance detail",
  },
  {
    pattern:
      /\b(implementation|codebase|compiler|kernel|serving|observability|tracing|debugging|reliability)\b/i,
    weight: 1,
    label: "implementation depth",
  },
  {
    pattern:
      /\b(api|sdk|cli|framework|library|repository|github|open[- ]source|developer|coding|runtime|deploy(?:ment)?)\b/i,
    weight: 0.5,
    label: "implementation surface",
  },
];

const BUILDER_SIGNALS = [
  {
    pattern:
      /\b(api|sdk|cli|framework|library|repository|open[- ]source|developer platform|plugin|integration|agent skills?)\b/i,
    weight: 1.2,
    label: "practical builder surface",
  },
  {
    pattern:
      /\b(mcp|model context protocol|mcp apps?|webmcp|a2a|agent2agent|agent(?:ic|s)?|coding[- ]agents?|tool calling|computer use|orchestration|workflow|runtime|sandbox|gateway|harness|sub-?agents?|multi-?agents?)\b/i,
    weight: 1,
    label: "agent or protocol relevance",
  },
  {
    pattern:
      /\b(launch(?:es|ed)?|release[ds]?|ships?|introduc(?:e|es|ed|ing)|adds?|supports?|available|general availability|public preview|open[- ]sources?)\b/i,
    weight: 0.9,
    label: "available to use or adopt",
  },
];

const BUILDER_SUBJECT_PATTERN =
  /\b(?:mcp|model context protocol|mcp apps?|webmcp|a2a|agent2agent|agents? sdk|agents? framework|agents? harness|agent skills?|coding[- ]agents?|sub-?agents?|multi-?agents?|tool calling|computer use|sdk|api|cli|framework|library|plugin|integration|orchestration|workflow|runtime|sandbox|gateway|developer platform)\b/i;

const BUILDER_AVAILABILITY_PATTERN =
  /\b(?:launch(?:es|ed)?|release[ds]?|ships?|introduc(?:e|es|ed|ing)|adds?|supports?|available|general availability|public preview|open[- ]sources?)\b/i;

const HYPE_PATTERNS = [
  /\b(revolutionary|game[- ]changing|secret weapon|breakthrough)\b/i,
  /\b(aces?|crushes?|destroys?|beats?)\b/i,
  /\b(first ever|world[- ]first|unprecedented)\b/i,
];

const OFFICIAL_NOISE_PATTERNS = [
  /\b(?:join(?:s|ed)?|appoint(?:s|ed)?)\b.*\bboard\b/i,
  /\b(?:grant|scholarship|fellowship|application program)\b/i,
  /\b(?:webinar|conference|event|roadshow)\b/i,
  /\b(?:tips?|ways) to (?:use|build|learn)\b/i,
  /\bhow .{1,80}\b(?:uses?|using)\b.{0,40}\b(?:ai|chatgpt|claude|gemini)\b/i,
  /\b(?:community|regional|local) (?:program|initiative|partnership)\b/i,
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "how",
  "in",
  "into",
  "is",
  "it",
  "new",
  "now",
  "of",
  "on",
  "or",
  "s",
  "so",
  "that",
  "the",
  "their",
  "this",
  "to",
  "up",
  "with",
]);

function signalScore(text, signals) {
  const matched = signals.filter(({ pattern }) => pattern.test(text));
  return {
    score: matched.reduce((total, { weight }) => total + weight, 0),
    labels: matched.map(({ label }) => label),
  };
}

function sourceIds(candidate) {
  return new Set(
    candidate.sourceAttributions.map((attribution) => attribution.sourceId),
  );
}

function vendorFromUrl(value) {
  try {
    return PRIMARY_VENDOR_HOSTS.get(
      new URL(value).hostname.toLocaleLowerCase(),
    ) ?? null;
  } catch {
    return null;
  }
}

function directEvidenceAuthority(value) {
  try {
    const host = new URL(value).hostname.toLocaleLowerCase();
    if (PRIMARY_VENDOR_HOSTS.has(host)) return 1;
    if (PRIMARY_RESEARCH_HOSTS.has(host)) return 0.95;
    return 0;
  } catch {
    return 0;
  }
}

function attributionKind(attribution) {
  if (attribution.sourceKind) return attribution.sourceKind;
  if (
    attribution.sourceRole === "official-lab" ||
    attribution.sourceRole === "official-product"
  ) {
    return "primary";
  }
  return "discovery";
}

function attributionStats(attributions) {
  const discoverySourceIds = new Set();
  const primarySourceIds = new Set();

  for (const attribution of attributions) {
    if (attributionKind(attribution) === "primary") {
      primarySourceIds.add(attribution.sourceId);
    } else {
      discoverySourceIds.add(attribution.sourceId);
    }
  }

  return {
    discoverySourceCount: discoverySourceIds.size,
    primarySourceCount: primarySourceIds.size,
  };
}

function titleTokens(title) {
  return new Set(
    normalizeWhitespace(title)
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

function titleSimilarity(left, right) {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (leftTokens.size < 3 || rightTokens.size < 3) return 0;

  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const containment = intersection / Math.min(leftTokens.size, rightTokens.size);
  const jaccard = intersection / union;

  return Math.max(jaccard, containment * 0.9);
}

function acquisitionSignature(title) {
  const normalized = normalizeWhitespace(title)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9.-]+/g, " ");
  const match = normalized.match(
    /\b([a-z0-9][a-z0-9.-]*)\s+(?:acquires?|acquired|to acquire)\s+([a-z0-9][a-z0-9.-]*)\b/,
  );
  return match ? `${match[1]}|${match[2]}` : null;
}

function isAggregatorUrl(value) {
  try {
    return AGGREGATOR_HOSTS.has(new URL(value).hostname.toLocaleLowerCase());
  } catch {
    return true;
  }
}

function isSpecificEvidenceUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLocaleLowerCase();
    if (AGGREGATOR_HOSTS.has(host)) return false;
    if (host === "x.com" || host === "twitter.com") {
      return /\/status\/\d+/i.test(url.pathname);
    }
    return url.pathname.replace(/\/+$/, "").length > 1;
  } catch {
    return false;
  }
}

function preferredCandidate(left, right) {
  const leftAggregator = isAggregatorUrl(left.url);
  const rightAggregator = isAggregatorUrl(right.url);

  if (leftAggregator !== rightAggregator) {
    return leftAggregator ? right : left;
  }

  const leftPrimary = left.sourceAttributions.some(
    (attribution) => attributionKind(attribution) === "primary",
  );
  const rightPrimary = right.sourceAttributions.some(
    (attribution) => attributionKind(attribution) === "primary",
  );
  if (leftPrimary !== rightPrimary) {
    return leftPrimary ? left : right;
  }

  if (left.editorialText.length !== right.editorialText.length) {
    return left.editorialText.length > right.editorialText.length ? left : right;
  }

  return new Date(left.publishedAt) >= new Date(right.publishedAt) ? left : right;
}

function mergeAttributions(left, right) {
  const unique = new Map();
  for (const attribution of [...left, ...right]) {
    const key = [
      attribution.sourceId,
      attribution.sourceUrl,
      attribution.section ?? "",
    ].join("|");
    unique.set(key, attribution);
  }
  return [...unique.values()];
}

function mergeCandidates(left, right) {
  const preferred = preferredCandidate(left, right);
  const other = preferred === left ? right : left;
  const mergedAttributions = mergeAttributions(
    preferred.sourceAttributions,
    other.sourceAttributions,
  );
  const stats = attributionStats(mergedAttributions);
  const vendor =
    preferred.vendor ??
    other.vendor ??
    mergedAttributions.find((attribution) => attribution.vendor)?.vendor ??
    vendorFromUrl(preferred.canonicalUrl ?? preferred.url) ??
    null;

  return {
    ...preferred,
    id: stableId(preferred.canonicalUrl || preferred.title),
    editorialText: normalizeWhitespace(
      `${preferred.editorialText} ${other.editorialText}`,
    ),
    sourceAttributions: mergedAttributions,
    discoveredBy: [...new Set(mergedAttributions.map(({ sourceName }) => sourceName))],
    discoverySourceCount: stats.discoverySourceCount,
    primarySourceCount: stats.primarySourceCount,
    corroborationCount: stats.discoverySourceCount,
    vendor,
    evidenceUrls: [
      ...new Set([
        ...(preferred.evidenceUrls ?? []),
        ...(other.evidenceUrls ?? []),
      ]),
    ].slice(0, 5),
  };
}

function shouldFuzzyMerge(left, right) {
  const leftSources = sourceIds(left);
  const rightSources = sourceIds(right);
  if ([...leftSources].some((sourceId) => rightSources.has(sourceId))) {
    return false;
  }

  const timeDifference = Math.abs(
    new Date(left.publishedAt).valueOf() -
      new Date(right.publishedAt).valueOf(),
  );
  if (timeDifference > 3 * DAY_MS) return false;

  const leftAcquisition = acquisitionSignature(left.title);
  const rightAcquisition = acquisitionSignature(right.title);
  if (leftAcquisition && leftAcquisition === rightAcquisition) return true;

  return titleSimilarity(left.title, right.title) >= 0.62;
}

export function isPromotionalStory({ title = "", section = "", text = "" }) {
  const haystack = normalizeWhitespace(`${section} ${title} ${text}`);
  return PROMOTIONAL_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function classifyLane(candidate) {
  const text = normalizeWhitespace(
    `${candidate.title} ${candidate.editorialText} ${candidate.section ?? ""}`,
  );
  const executive = signalScore(text, EXECUTIVE_SIGNALS);
  const technical = signalScore(text, TECHNICAL_SIGNALS);
  const builder = signalScore(text, BUILDER_SIGNALS);
  const attributionRoles = new Set(
    (candidate.sourceAttributions ?? []).map(({ sourceRole }) => sourceRole),
  );
  const builderSource =
    attributionRoles.has("official-builder") ||
    attributionRoles.has("official-ecosystem") ||
    attributionRoles.has("practitioner-signal");
  const builderQualified =
    BUILDER_SUBJECT_PATTERN.test(text) &&
    (BUILDER_AVAILABILITY_PATTERN.test(text) || builderSource);
  const deepTechnical =
    technical.score >= 1.4 &&
    /\b(architecture|training|fine[- ]tun(?:e|ing)|inference|latency|throughput|token|context window|benchmark|evaluation|database|algorithm|quantization|compiler|kernel)\b/i.test(
      text,
    );

  let lane = "executive";
  if (
    builderQualified &&
    builder.score >= 1.9 &&
    (!deepTechnical || builder.score >= technical.score)
  ) {
    lane = "builder";
  } else if (
    deepTechnical &&
    technical.score >= executive.score + 0.3
  ) {
    lane = "technical";
  } else if (executive.score >= 1.3) {
    lane = "executive";
  } else if (builderQualified && builder.score >= 1.2) {
    lane = "builder";
  } else if (technical.score >= 1) {
    lane = "technical";
  } else if (
    technical.score > 0 ||
    /\b(engineering|technical)\b/i.test(candidate.section ?? "")
  ) {
    lane = "technical";
  } else if (
    builder.score > 0 ||
    /\b(builder|developer)\b/i.test(candidate.section ?? "")
  ) {
    lane = "builder";
  }

  const communityLaunchOnly =
    attributionRoles.size === 1 &&
    attributionRoles.has("community-signal") &&
    /^(?:Launch|Show) HN:/i.test(candidate.title);
  if (communityLaunchOnly && lane === "executive") {
    lane = builderQualified ? "builder" : "technical";
  }

  return {
    lane,
    signals: {
      executive: Number(executive.score.toFixed(2)),
      technical: Number(technical.score.toFixed(2)),
      builder: Number(builder.score.toFixed(2)),
    },
    labels: {
      executive: executive.labels,
      technical: technical.labels,
      builder: builder.labels,
    },
  };
}

export function scoreCandidate(candidate, config, asOf) {
  const classification = classifyLane(candidate);
  const discoverySourceCount = candidate.discoverySourceCount ?? 0;
  const primarySourceCount = candidate.primarySourceCount ?? 0;
  const sourceRoles = [
    ...new Set(
      candidate.sourceAttributions.map(({ sourceRole }) => sourceRole),
    ),
  ];
  const discoveryRoles = [
    ...new Set(
      candidate.sourceAttributions
        .filter((attribution) => attributionKind(attribution) !== "primary")
        .map(({ sourceRole }) => sourceRole),
    ),
  ];
  const discoveryWeights =
    config.sourceSignals?.discoveryWeight ?? config.sourcePriority ?? {};
  const evidenceWeights = config.sourceSignals?.evidenceAuthority ?? {};
  const discoveryWeight = Math.max(
    0,
    ...discoveryRoles.map(
      (role) =>
        discoveryWeights[role] ??
        discoveryWeights["diverse-newsletter"] ??
        1,
    ),
  );
  const evidenceAuthority = Math.max(
    directEvidenceAuthority(candidate.canonicalUrl ?? candidate.url),
    0,
    ...sourceRoles.map((role) => evidenceWeights[role] ?? 0.5),
  );
  const recencyDate = candidate.publishedAt;
  const ageDays = Math.max(
    0,
    (new Date(asOf).valueOf() - new Date(recencyDate).valueOf()) /
      DAY_MS,
  );
  const recencyDecay = 0.35;
  const recencyScore = Math.max(0, 3 - ageDays * recencyDecay);
  const section = candidate.section?.toLocaleLowerCase() ?? "";
  const sectionScore = section.includes("headlines")
    ? 1.3
    : section.includes("deep dive") || section.includes("analysis")
      ? 1.1
      : section.includes("engineering") ||
          section.includes("research") ||
          section.includes("builder")
        ? 0.8
        : section.includes("quick")
          ? 0.25
          : 0.55;
  const laneBias =
    classification.lane === "executive"
      ? 1.2
      : classification.lane === "technical"
        ? 0.5
        : 0.7;
  const laneSignal = classification.signals[classification.lane];
  const crossDiscoveryBonus =
    Math.max(0, discoverySourceCount - 1) * 1.25;
  const isXSource =
    candidate.originalDomain === "x.com" ||
    candidate.originalDomain === "twitter.com";
  const xSignalBonus = isXSource ? 0.2 : 0;
  const hypePenalty = HYPE_PATTERNS.reduce(
    (total, pattern) =>
      total + (pattern.test(`${candidate.title} ${candidate.editorialText}`) ? 0.35 : 0),
    0,
  );
  const officialOnly =
    primarySourceCount > 0 && discoverySourceCount === 0;
  const officialNoisePenalty = officialOnly
    ? Math.min(
        1.5,
        OFFICIAL_NOISE_PATTERNS.reduce(
          (total, pattern) =>
            total +
            (pattern.test(`${candidate.title} ${candidate.editorialText}`)
              ? 0.75
              : 0),
          0,
        ),
      )
    : 0;
  const communityEngagement =
    sourceRoles.includes("community-signal") && candidate.engagement
      ? Math.min(
          1.6,
          Math.log10(Math.max(0, candidate.engagement.points ?? 0) + 1) * 0.4 +
            Math.log10(Math.max(0, candidate.engagement.comments ?? 0) + 1) *
              0.2,
        )
      : 0;
  const communityLaunchPenalty =
    candidate.discoverySourceCount === 1 &&
    sourceRoles.includes("community-signal") &&
    /^(?:Launch|Show) HN:/i.test(candidate.title)
      ? 1.2
      : 0;
  const needsPrimaryEvidenceReview =
    isAggregatorUrl(candidate.url) &&
    !(candidate.evidenceUrls ?? []).some(isSpecificEvidenceUrl);
  const missingEvidencePenalty = needsPrimaryEvidenceReview ? 0.8 : 0;

  const score =
    discoveryWeight * 2 +
    evidenceAuthority * 0.8 +
    recencyScore +
    sectionScore +
    laneBias +
    laneSignal +
    crossDiscoveryBonus +
    communityEngagement +
    xSignalBonus -
    Math.min(1.05, hypePenalty) -
    officialNoisePenalty -
    communityLaunchPenalty -
    missingEvidencePenalty;

  const reasons = [
    `${classification.lane} lane`,
    ...classification.labels[classification.lane].slice(0, 2),
  ];
  if (sectionScore >= 1.1) reasons.push("high-signal newsletter section");
  if (discoverySourceCount > 1) {
    reasons.push(
      `seen in ${discoverySourceCount} discovery channels`,
    );
  }
  if (evidenceAuthority >= 0.9) reasons.push("primary-source evidence");
  if (communityEngagement >= 1) reasons.push("strong community attention");
  if (isXSource) reasons.push("originated on X");
  if (hypePenalty > 0) reasons.push("promotional-language penalty applied");
  if (officialNoisePenalty > 0) {
    reasons.push("official-feed noise penalty applied");
  }
  if (communityLaunchPenalty > 0) {
    reasons.push("community launch-post penalty applied");
  }
  if (needsPrimaryEvidenceReview) {
    reasons.push("primary evidence requires editorial review");
  }

  return {
    ...candidate,
    editorialLane: classification.lane,
    laneSignals: classification.signals,
    score: Number(score.toFixed(2)),
    sourceSignals: {
      discoveryWeight: Number(discoveryWeight.toFixed(2)),
      evidenceAuthority: Number(evidenceAuthority.toFixed(2)),
      discoverySourceCount,
      primarySourceCount,
    },
    selectionReasons: [...new Set(reasons)],
    flags: {
      ...candidate.flags,
      originatedOnX: isXSource,
      promotionalLanguage: hypePenalty > 0,
      officialOnly,
      officialNoise: officialNoisePenalty > 0,
      communityLaunchPost: communityLaunchPenalty > 0,
      needsPrimaryEvidenceReview,
    },
  };
}

export function isPublicationEligibleCandidate(candidate) {
  let url;
  try {
    url = new URL(candidate.url);
  } catch {
    return false;
  }

  return (
    url.protocol === "https:" &&
    candidate.flags?.promotionalLanguage !== true &&
    candidate.flags?.needsPrimaryEvidenceReview !== true
  );
}

export function prepareCandidate(candidate) {
  const canonicalUrl = canonicalizeUrl(candidate.url);
  if (!canonicalUrl) return null;
  const sourceAttributions = candidate.sourceAttributions ?? [];
  const discoveredBy = [
    ...new Set(sourceAttributions.map(({ sourceName }) => sourceName)),
  ];
  const stats = attributionStats(sourceAttributions);
  const vendor =
    candidate.vendor ??
    sourceAttributions.find((attribution) => attribution.vendor)?.vendor ??
    vendorFromUrl(canonicalUrl) ??
    null;

  return {
    ...candidate,
    id: stableId(canonicalUrl || candidate.title),
    canonicalUrl,
    url: canonicalUrl,
    originalDomain: new URL(canonicalUrl).hostname.toLocaleLowerCase(),
    sourceAttributions,
    discoveredBy,
    discoverySourceCount: stats.discoverySourceCount,
    primarySourceCount: stats.primarySourceCount,
    corroborationCount: stats.discoverySourceCount,
    vendor,
    reviewStatus: "needs-review",
    summaryStatus: "not-generated",
  };
}

export function dedupeCandidates(candidates, { fuzzy = true } = {}) {
  const merged = [];

  for (const unprepared of candidates) {
    const candidate = prepareCandidate(unprepared);
    if (!candidate) continue;

    const exactIndex = merged.findIndex(
      (current) => current.canonicalUrl === candidate.canonicalUrl,
    );
    if (exactIndex >= 0) {
      merged[exactIndex] = mergeCandidates(merged[exactIndex], candidate);
      continue;
    }

    if (fuzzy) {
      const fuzzyIndex = merged.findIndex((current) =>
        shouldFuzzyMerge(current, candidate),
      );
      if (fuzzyIndex >= 0) {
        merged[fuzzyIndex] = mergeCandidates(merged[fuzzyIndex], candidate);
        continue;
      }
    }

    merged.push(candidate);
  }

  return merged;
}

export function computeMixQuotas(total, mix) {
  const entries = LANE_ORDER.map((lane) => [lane, mix[lane] ?? 0]);
  const raw = entries.map(([lane, weight]) => ({
    lane,
    raw: total * weight,
    count: Math.floor(total * weight),
  }));
  let remaining = total - raw.reduce((sum, entry) => sum + entry.count, 0);

  raw
    .sort(
      (left, right) =>
        right.raw - Math.floor(right.raw) - (left.raw - Math.floor(left.raw)),
    )
    .forEach((entry) => {
      if (remaining <= 0) return;
      entry.count += 1;
      remaining -= 1;
    });

  return Object.fromEntries(raw.map(({ lane, count }) => [lane, count]));
}

function guardedVendor(candidate) {
  if (
    candidate.primarySourceCount > 0 &&
    candidate.discoverySourceCount === 0
  ) {
    return candidate.vendor;
  }
  return null;
}

function soleDiscoverySource(candidate) {
  const candidateSourceIds = new Set(
    (candidate.sourceAttributions ?? [])
      .filter((attribution) => attributionKind(attribution) !== "primary")
      .map(({ sourceId }) => sourceId),
  );
  return candidateSourceIds.size === 1 ? [...candidateSourceIds][0] : null;
}

export function selectEditorialMix(
  candidates,
  maxItems,
  mix,
  {
    maxUncorroboratedOfficialItemsPerVendor = Number.POSITIVE_INFINITY,
    modelLabVendors = [],
    maxModelLabItems = Number.POSITIVE_INFINITY,
    maxModelLabItemsPerVendor = Number.POSITIVE_INFINITY,
    maxSoleDiscoveryItemsBySource = {},
    maxSoleDiscoveryItemsBySourcePerLane = {},
    preserveEditorialMix = false,
  } = {},
) {
  const quotas = computeMixQuotas(maxItems, mix);
  const selected = [];
  const selectedIds = new Set();
  const guardedVendorCounts = new Map();
  const modelLabVendorSet = new Set(modelLabVendors);
  const modelLabVendorCounts = new Map();
  let modelLabItems = 0;
  const soleDiscoveryCounts = new Map();
  const soleDiscoveryLaneCounts = new Map();

  function respectsModelLabLimits(candidate) {
    const vendors = identifyModelLabVendors(candidate, modelLabVendorSet);
    if (vendors.length === 0) return true;
    return (
      modelLabItems < maxModelLabItems &&
      vendors.every(
        (vendor) =>
          (modelLabVendorCounts.get(vendor) ?? 0) <
          maxModelLabItemsPerVendor,
      )
    );
  }

  function canSelect(candidate) {
    if (!respectsModelLabLimits(candidate)) return false;
    const vendor = guardedVendor(candidate);
    if (
      vendor &&
      (guardedVendorCounts.get(vendor) ?? 0) >=
        maxUncorroboratedOfficialItemsPerVendor
    ) {
      return false;
    }

    const sourceId = soleDiscoverySource(candidate);
    if (!sourceId) return true;
    if (
      (soleDiscoveryCounts.get(sourceId) ?? 0) >=
      (maxSoleDiscoveryItemsBySource[sourceId] ??
        Number.POSITIVE_INFINITY)
    ) {
      return false;
    }
    const laneKey = `${sourceId}|${candidate.editorialLane}`;
    return (
      (soleDiscoveryLaneCounts.get(laneKey) ?? 0) <
      (maxSoleDiscoveryItemsBySourcePerLane[sourceId] ??
        Number.POSITIVE_INFINITY)
    );
  }

  function addCandidate(candidate) {
    selected.push(candidate);
    selectedIds.add(candidate.id);
    const vendor = guardedVendor(candidate);
    if (vendor) {
      guardedVendorCounts.set(
        vendor,
        (guardedVendorCounts.get(vendor) ?? 0) + 1,
      );
    }
    const candidateModelLabVendors = identifyModelLabVendors(
      candidate,
      modelLabVendorSet,
    );
    if (candidateModelLabVendors.length > 0) {
      modelLabItems += 1;
      for (const vendor of candidateModelLabVendors) {
        modelLabVendorCounts.set(
          vendor,
          (modelLabVendorCounts.get(vendor) ?? 0) + 1,
        );
      }
    }
    const sourceId = soleDiscoverySource(candidate);
    if (sourceId) {
      soleDiscoveryCounts.set(
        sourceId,
        (soleDiscoveryCounts.get(sourceId) ?? 0) + 1,
      );
      const laneKey = `${sourceId}|${candidate.editorialLane}`;
      soleDiscoveryLaneCounts.set(
        laneKey,
        (soleDiscoveryLaneCounts.get(laneKey) ?? 0) + 1,
      );
    }
  }

  for (const lane of LANE_ORDER) {
    const laneCandidates = candidates
      .filter((candidate) => candidate.editorialLane === lane)
      .sort((left, right) => right.score - left.score);

    let laneCount = 0;
    for (const candidate of laneCandidates) {
      if (laneCount >= quotas[lane]) break;
      if (!canSelect(candidate)) continue;
      addCandidate(candidate);
      laneCount += 1;
    }
  }

  if (preserveEditorialMix) {
    for (const lane of LANE_ORDER) {
      let laneCount = selected.filter(
        (candidate) => candidate.editorialLane === lane,
      ).length;
      const blockedInLane = candidates
        .filter(
          (candidate) =>
            candidate.editorialLane === lane &&
            !selectedIds.has(candidate.id) &&
            respectsModelLabLimits(candidate),
        )
        .sort((left, right) => right.score - left.score);

      for (const candidate of blockedInLane) {
        if (laneCount >= quotas[lane]) break;
        if (!respectsModelLabLimits(candidate)) continue;
        addCandidate({
          ...candidate,
          flags: {
            ...candidate.flags,
            selectionGuardrailRelaxed: true,
          },
          selectionReasons: [
            ...(candidate.selectionReasons ?? []),
            "selection guardrail relaxed to preserve editorial mix",
          ],
        });
        laneCount += 1;
      }
    }

    return LANE_ORDER.flatMap((lane) =>
      selected
        .filter((candidate) => candidate.editorialLane === lane)
        .sort((left, right) => right.score - left.score),
    );
  }

  if (selected.length < maxItems) {
    const remaining = candidates
      .filter((candidate) => !selectedIds.has(candidate.id))
      .sort((left, right) => right.score - left.score);

    for (const candidate of remaining) {
      if (selected.length >= maxItems) break;
      if (!canSelect(candidate)) continue;
      addCandidate(candidate);
    }
  }

  if (selected.length < maxItems) {
    const blocked = candidates
      .filter(
        (candidate) =>
          !selectedIds.has(candidate.id) &&
          respectsModelLabLimits(candidate),
      )
      .sort((left, right) => right.score - left.score);

    for (const candidate of blocked) {
      if (selected.length >= maxItems) break;
      if (!respectsModelLabLimits(candidate)) continue;
      addCandidate({
        ...candidate,
        flags: {
          ...candidate.flags,
          officialVendorGuardrailRelaxed: true,
        },
        selectionReasons: [
          ...(candidate.selectionReasons ?? []),
          "official-vendor guardrail relaxed to fill review queue",
        ],
      });
    }
  }

  return LANE_ORDER.flatMap((lane) =>
    selected
      .filter((candidate) => candidate.editorialLane === lane)
      .sort((left, right) => right.score - left.score),
  );
}

export function countEditorialMix(candidates) {
  return Object.fromEntries(
    LANE_ORDER.map((lane) => [
      lane,
      candidates.filter((candidate) => candidate.editorialLane === lane).length,
    ]),
  );
}
