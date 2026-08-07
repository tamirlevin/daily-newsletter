import {
  BRIEFING_PROFILES,
  briefingProfile,
  normalizeCadence,
  runIdFor,
} from "../lib/briefing-profiles.mjs";
import { validateBriefSummary } from "../lib/brief-summary.mjs";
import {
  identifyModelLabVendors,
  MAX_MODEL_LAB_ITEMS_PER_VENDOR,
  MODEL_LAB_VENDORS,
} from "../lib/model-labs.mjs";

export const RETAINED_RUNS_BY_CADENCE = Object.freeze(
  Object.fromEntries(
    Object.entries(BRIEFING_PROFILES).map(([cadence, profile]) => [
      cadence,
      profile.retainedRuns,
    ]),
  ),
);

export const EXPECTED_MIX_BY_CADENCE = Object.freeze(
  Object.fromEntries(
    Object.entries(BRIEFING_PROFILES).map(([cadence, profile]) => [
      cadence,
      profile.expectedMix,
    ]),
  ),
);

const ACTIVE_LANES = Object.freeze([
  ...new Set(
    Object.values(BRIEFING_PROFILES).flatMap((profile) =>
      Object.keys(profile.expectedMix),
    ),
  ),
]);
const ALLOWED_LANES = new Set(ACTIVE_LANES);

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function validIsoDate(value, field) {
  const normalized = requiredText(value, field);
  if (Number.isNaN(new Date(normalized).valueOf())) {
    throw new Error(`${field} must be a valid ISO date`);
  }
  return normalized;
}

function validHttpsUrl(value, field) {
  const normalized = requiredText(value, field);
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${field} must be a valid URL`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`${field} must use HTTPS`);
  }
  return url.toString();
}

export function validatePublicationRun(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Run payload must be an object");
  }
  if (payload.schemaVersion !== 3) {
    throw new Error("Unsupported run schema");
  }
  if (payload.kind !== "collection-draft") {
    throw new Error("Unsupported run kind");
  }

  const cadence = normalizeCadence(payload.cadence);
  const profile = briefingProfile(cadence);
  const issueDate = requiredText(payload.issueDate, "issueDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    throw new Error("issueDate must use YYYY-MM-DD");
  }
  const generatedAt = validIsoDate(payload.generatedAt, "generatedAt");
  const runId = requiredText(payload.runId, "runId");
  if (runId !== runIdFor(cadence, issueDate)) {
    throw new Error(
      `runId must be ${runIdFor(cadence, issueDate)}`,
    );
  }
  if (payload.editorialPolicy?.profile !== cadence) {
    throw new Error(`editorialPolicy.profile must be ${cadence}`);
  }

  const sourceHealth = payload.sourceHealth;
  if (!sourceHealth || typeof sourceHealth !== "object") {
    throw new Error("sourceHealth is required");
  }
  if (sourceHealth.status === "failed") {
    throw new Error("Source collection failed");
  }
  if (
    !Number.isInteger(sourceHealth.configuredSources) ||
    sourceHealth.configuredSources < 5
  ) {
    throw new Error("At least five configured sources are required");
  }
  const minimumHealthySources = Math.ceil(
    sourceHealth.configuredSources * 0.6,
  );
  if (
    !Number.isInteger(sourceHealth.healthySources) ||
    sourceHealth.healthySources < minimumHealthySources
  ) {
    throw new Error(
      `At least ${minimumHealthySources} sources must be healthy`,
    );
  }

  if (
    !Array.isArray(payload.items) ||
    payload.items.length !== profile.maxItems
  ) {
    throw new Error(
      `A publishable ${cadence} run must contain exactly ${profile.maxItems} stories`,
    );
  }

  const itemIds = new Set();
  const itemUrls = new Set();
  const mix = Object.fromEntries(ACTIVE_LANES.map((lane) => [lane, 0]));
  const modelLabVendorCounts = new Map();
  let modelLabItems = 0;

  for (const [index, item] of payload.items.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`items[${index}] must be an object`);
    }
    const id = requiredText(item.id, `items[${index}].id`);
    if (itemIds.has(id)) {
      throw new Error(`Duplicate story id: ${id}`);
    }
    itemIds.add(id);

    requiredText(item.title, `items[${index}].title`);
    const url = validHttpsUrl(item.url, `items[${index}].url`);
    if (itemUrls.has(url)) {
      throw new Error(`Duplicate story URL: ${url}`);
    }
    itemUrls.add(url);

    validIsoDate(item.publishedAt, `items[${index}].publishedAt`);
    if (item.summaryStatus === "generated") {
      validateBriefSummary(item.briefSummary, {
        field: `items[${index}].briefSummary`,
      });
    } else if (item.summaryStatus === "unavailable") {
      if ("briefSummary" in item) {
        throw new Error(
          `items[${index}].briefSummary must be omitted when unavailable`,
        );
      }
    } else {
      throw new Error(
        `items[${index}].summaryStatus must be generated or unavailable`,
      );
    }
    if (
      "editorialText" in item ||
      "summaryEvidenceText" in item
    ) {
      throw new Error(`items[${index}] exposes internal source text`);
    }
    const lane = requiredText(
      item.editorialLane,
      `items[${index}].editorialLane`,
    );
    if (!ALLOWED_LANES.has(lane)) {
      throw new Error(`Unsupported editorial lane: ${lane}`);
    }
    mix[lane] += 1;

    if (
      !Array.isArray(item.selectionReasons) ||
      item.selectionReasons.length === 0
    ) {
      throw new Error(`items[${index}] needs a selection reason`);
    }
    if (item.flags?.needsPrimaryEvidenceReview === true) {
      throw new Error(`items[${index}] is missing sufficient evidence`);
    }
    if (item.flags?.promotionalLanguage === true) {
      throw new Error(`items[${index}] contains promotional language`);
    }

    const modelLabVendors = identifyModelLabVendors(
      item,
      MODEL_LAB_VENDORS,
    );
    if (modelLabVendors.length > 0) {
      modelLabItems += 1;
      for (const vendor of modelLabVendors) {
        modelLabVendorCounts.set(
          vendor,
          (modelLabVendorCounts.get(vendor) ?? 0) + 1,
        );
      }
    }
  }

  for (const [lane, expected] of Object.entries(profile.expectedMix)) {
    if (mix[lane] !== expected) {
      throw new Error(
        `Editorial mix must contain ${expected} ${lane} stories`,
      );
    }
  }

  for (const [vendor, count] of modelLabVendorCounts) {
    if (count > MAX_MODEL_LAB_ITEMS_PER_VENDOR) {
      throw new Error(
        `A run may contain at most ${MAX_MODEL_LAB_ITEMS_PER_VENDOR} story from model lab ${vendor}`,
      );
    }
  }
  if (modelLabItems > profile.selectionRules.maxModelLabItems) {
    throw new Error(
      `A ${cadence} run may contain at most ${profile.selectionRules.maxModelLabItems} model-lab stories`,
    );
  }

  return {
    runId,
    cadence,
    issueDate,
    generatedAt,
    sourceHealth: sourceHealth.status,
    mix,
    retainedRuns: profile.retainedRuns,
    emailEligible: profile.emailEnabled,
    summaryCoverage: {
      generated: payload.items.filter(
        (item) => item.summaryStatus === "generated",
      ).length,
      unavailable: payload.items.filter(
        (item) => item.summaryStatus === "unavailable",
      ).length,
    },
  };
}

export function preparePublishedRun(
  payload,
  publishedAt = new Date().toISOString(),
) {
  const validated = validatePublicationRun(payload);
  const publicationTime = validIsoDate(publishedAt, "publishedAt");
  const published = JSON.parse(JSON.stringify(payload));
  published.status = "published";
  published.publication = {
    method: "automatic",
    publishedAt: publicationTime,
  };

  return {
    ...validated,
    publishedAt: publicationTime,
    payload: published,
  };
}
