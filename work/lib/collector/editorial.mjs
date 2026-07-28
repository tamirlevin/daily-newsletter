import {
  canonicalizeUrl,
  normalizeWhitespace,
  stableId,
} from "./shared.mjs";

const DAY_MS = 86_400_000;
const LANE_ORDER = ["executive", "technical", "research"];
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
  ["blog.google", "google"],
  ["claude.com", "anthropic"],
  ["deepmind.google", "google"],
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
    pattern: /\b(openai|anthropic|google|microsoft|meta|amazon|apple|nvidia)\b/i,
    weight: 0.3,
    label: "major platform relevance",
  },
];

const TECHNICAL_SIGNALS = [
  {
    pattern:
      /\b(api|sdk|cli|framework|library|repository|github|open[- ]source|developer|coding|codebase|inference|runtime|deploy(?:ment)?|database)\b/i,
    weight: 1.4,
    label: "implementation relevance",
  },
  {
    pattern: /\b(agent|model|tool|workflow|orchestration|evaluation)\b/i,
    weight: 0.5,
    label: "builder workflow relevance",
  },
  {
    pattern:
      /\b(architecture|training|fine[- ]tun(?:e|ing)|latency|throughput|token|context window)\b/i,
    weight: 0.9,
    label: "technical capability detail",
  },
];

const RESEARCH_SIGNALS = [
  {
    pattern: /\b(paper|study|research|researcher|arxiv|journal|scientist)\b/i,
    weight: 1.8,
    label: "research result",
  },
  {
    pattern:
      /\b(benchmark|dataset|experiment|scaling law|peer review|ablation)\b/i,
    weight: 1.2,
    label: "evaluation or evidence",
  },
  {
    pattern: /\b(novel|method|accuracy|score|theorem|proof)\b/i,
    weight: 0.5,
    label: "research-method signal",
  },
];

const RESEARCH_CONSEQUENCE_SIGNALS = [
  {
    pattern:
      /\b(agent(?:ic|s)?|tool[- ]use|reasoning|evaluation|benchmark|safety|alignment|reliability|oversight)\b/i,
    weight: 1.2,
  },
  {
    pattern:
      /\b(inference|efficien(?:cy|t)|latency|cost|scal(?:e|ing)|deployment|context window)\b/i,
    weight: 0.8,
  },
  {
    pattern:
      /\b(foundation model|language model|multimodal|world model|robotics?)\b/i,
    weight: 0.4,
  },
];

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
  const researchIndexed = candidate.sourceAttributions?.some(
    ({ sourceRole }) => sourceRole === "research-index",
  );
  const researchUrl = candidate.url ?? "";
  const academicUrl =
    /(?:^|\/\/)(?:arxiv\.org|openreview\.net|aclanthology\.org|proceedings\.)/i.test(
      researchUrl,
    );
  const explicitResearchTitle =
    /\b(?:paper|study|research(?:ers?)?|theorem)\b/i.test(candidate.title);
  const researchQualified =
    researchIndexed || academicUrl || explicitResearchTitle;
  const indexedAcademicResearch = researchIndexed && academicUrl;
  const executive = signalScore(text, EXECUTIVE_SIGNALS);
  const technical = signalScore(text, TECHNICAL_SIGNALS);
  const research = signalScore(text, RESEARCH_SIGNALS);

  let lane = "executive";
  if (indexedAcademicResearch) {
    lane = "research";
  } else if (
    researchQualified &&
    research.score >= 2 &&
    research.score >= technical.score + 0.5 &&
    research.score >= executive.score + 0.5
  ) {
    lane = "research";
  } else if (
    technical.score >= 1.4 &&
    technical.score >= executive.score + 0.6 &&
    technical.score >= research.score
  ) {
    lane = "technical";
  } else if (executive.score >= 1.3) {
    lane = "executive";
  } else if (technical.score >= 1) {
    lane = "technical";
  } else if (researchQualified && research.score >= 1.2) {
    lane = "research";
  } else if (
    technical.score > 0 ||
    /\b(engineering|builder|developer)\b/i.test(candidate.section ?? "")
  ) {
    lane = "technical";
  }

  const attributionRoles = new Set(
    (candidate.sourceAttributions ?? []).map(({ sourceRole }) => sourceRole),
  );
  const communityLaunchOnly =
    attributionRoles.size === 1 &&
    attributionRoles.has("community-signal") &&
    /^(?:Launch|Show) HN:/i.test(candidate.title);
  if (communityLaunchOnly && lane === "executive") {
    lane = "technical";
  }

  return {
    lane,
    signals: {
      executive: Number(executive.score.toFixed(2)),
      technical: Number(technical.score.toFixed(2)),
      research: Number(research.score.toFixed(2)),
    },
    labels: {
      executive: executive.labels,
      technical: technical.labels,
      research: research.labels,
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
  const discoveryWeights =
    config.sourceSignals?.discoveryWeight ?? config.sourcePriority ?? {};
  const evidenceWeights = config.sourceSignals?.evidenceAuthority ?? {};
  const discoveryWeight = Math.max(
    0,
    ...sourceRoles.map(
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
  const recencyDate =
    classification.lane === "research"
      ? candidate.paperMetadata?.submittedAt ?? candidate.publishedAt
      : candidate.publishedAt;
  const ageDays = Math.max(
    0,
    (new Date(asOf).valueOf() - new Date(recencyDate).valueOf()) /
      DAY_MS,
  );
  const recencyDecay = classification.lane === "research" ? 0.2 : 0.35;
  const recencyScore = Math.max(0, 3 - ageDays * recencyDecay);
  const section = candidate.section?.toLocaleLowerCase() ?? "";
  const sectionScore = section.includes("headlines")
    ? 1.3
    : section.includes("deep dive") || section.includes("analysis")
      ? 1.1
      : section.includes("engineering") || section.includes("research")
        ? 0.8
        : section.includes("quick")
          ? 0.25
          : 0.55;
  const laneBias =
    classification.lane === "executive"
      ? 1.2
      : classification.lane === "technical"
        ? 0.5
        : 0.2;
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
  const researchAttention =
    sourceRoles.includes("research-index") && candidate.engagement
      ? Math.min(
          1,
          Math.log10(Math.max(0, candidate.engagement.upvotes ?? 0) + 1) * 0.45,
        )
      : 0;
  const researchConsequence =
    classification.lane === "research"
      ? RESEARCH_CONSEQUENCE_SIGNALS.reduce(
          (total, { pattern, weight }) =>
            total +
            (pattern.test(`${candidate.title} ${candidate.editorialText}`)
              ? weight
              : 0),
          0,
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
    researchAttention +
    researchConsequence +
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
  if (researchAttention >= 0.6) reasons.push("research-community attention");
  if (researchConsequence >= 1.2) {
    reasons.push("high-consequence research topic");
  }
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
    maxSoleDiscoveryItemsBySource = {},
    maxSoleDiscoveryItemsBySourcePerLane = {},
    preserveEditorialMix = false,
  } = {},
) {
  const quotas = computeMixQuotas(maxItems, mix);
  const selected = [];
  const selectedIds = new Set();
  const guardedVendorCounts = new Map();
  const soleDiscoveryCounts = new Map();
  const soleDiscoveryLaneCounts = new Map();

  function canSelect(candidate) {
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
            !selectedIds.has(candidate.id),
        )
        .sort((left, right) => right.score - left.score);

      for (const candidate of blockedInLane) {
        if (laneCount >= quotas[lane]) break;
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
      .filter((candidate) => !selectedIds.has(candidate.id))
      .sort((left, right) => right.score - left.score);

    for (const candidate of blocked) {
      if (selected.length >= maxItems) break;
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
