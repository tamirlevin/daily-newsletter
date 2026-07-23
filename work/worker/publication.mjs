export const RETAINED_RUNS = 3;
export const EXPECTED_MIX = Object.freeze({
  executive: 7,
  technical: 2,
  research: 1,
});

const ALLOWED_LANES = new Set(Object.keys(EXPECTED_MIX));

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
  if (payload.schemaVersion !== 1) {
    throw new Error("Unsupported run schema");
  }
  if (payload.kind !== "collection-draft") {
    throw new Error("Unsupported run kind");
  }

  const issueDate = requiredText(payload.issueDate, "issueDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    throw new Error("issueDate must use YYYY-MM-DD");
  }
  const generatedAt = validIsoDate(payload.generatedAt, "generatedAt");

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

  if (!Array.isArray(payload.items) || payload.items.length !== 10) {
    throw new Error("A publishable run must contain exactly 10 stories");
  }

  const itemIds = new Set();
  const itemUrls = new Set();
  const mix = { executive: 0, technical: 0, research: 0 };

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
  }

  for (const [lane, expected] of Object.entries(EXPECTED_MIX)) {
    if (mix[lane] !== expected) {
      throw new Error(
        `Editorial mix must contain ${expected} ${lane} stories`,
      );
    }
  }

  return {
    runId: generatedAt,
    issueDate,
    generatedAt,
    sourceHealth: sourceHealth.status,
    mix,
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
