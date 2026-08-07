export const MODEL_LAB_VENDORS = Object.freeze([
  "openai",
  "anthropic",
  "google",
  "meta",
  "mistral",
  "xai",
  "deepseek",
  "alibaba",
  "cohere",
]);

export const MAX_MODEL_LAB_ITEMS_PER_VENDOR = 1;

const MODEL_LAB_HOSTS = new Map([
  ["ai.google.dev", "google"],
  ["ai.meta.com", "meta"],
  ["alibaba.com", "alibaba"],
  ["anthropic.com", "anthropic"],
  ["blog.google", "google"],
  ["chatgpt.com", "openai"],
  ["claude.com", "anthropic"],
  ["cohere.com", "cohere"],
  ["deepmind.google", "google"],
  ["deepseek.com", "deepseek"],
  ["grok.com", "xai"],
  ["google.com", "google"],
  ["mistral.ai", "mistral"],
  ["openai.com", "openai"],
  ["qwen.ai", "alibaba"],
  ["x.ai", "xai"],
]);

const MODEL_LAB_TEXT_PATTERNS = new Map([
  ["openai", /\b(?:openai|chatgpt|gpt[- ]?[\w.]*|codex|sora)\b/i],
  ["anthropic", /\b(?:anthropic|claude)\b/i],
  ["google", /\b(?:google(?: deepmind)?|deepmind|gemini)\b/i],
  ["meta", /(?:\bmeta\b.{0,40}\bai\b|\bllama[\w.-]*)/i],
  ["mistral", /\b(?:mistral|mixtral)\b/i],
  ["xai", /\b(?:xai|grok)\b/i],
  ["deepseek", /\bdeepseek\b/i],
  ["alibaba", /(?:\balibaba\b|\bqwen[\w.-]*)/i],
  ["cohere", /\bcohere\b/i],
]);

function hostname(value) {
  try {
    return new URL(value).hostname.toLocaleLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function vendorFromHostname(host) {
  for (const [baseDomain, vendor] of MODEL_LAB_HOSTS) {
    if (host === baseDomain || host.endsWith(`.${baseDomain}`)) {
      return vendor;
    }
  }
  return null;
}

export function identifyModelLabVendors(
  candidate,
  configuredVendors = MODEL_LAB_VENDORS,
) {
  const configured = new Set(configuredVendors);
  const identified = new Set();
  if (candidate.vendor && configured.has(candidate.vendor)) {
    identified.add(candidate.vendor);
  }

  const urls = [
    candidate.url,
    candidate.canonicalUrl,
    ...(candidate.evidenceUrls ?? []),
  ];
  for (const value of urls) {
    const vendor = vendorFromHostname(hostname(value));
    if (vendor && configured.has(vendor)) identified.add(vendor);
  }

  const text = `${candidate.title ?? ""} ${candidate.editorialText ?? ""}`
    .replace(/\bformer\s+(?:openai|anthropic|google|deepmind|meta|mistral|xai)\s+(?:exec(?:utive)?|employee|researcher)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [vendor, pattern] of MODEL_LAB_TEXT_PATTERNS) {
    if (configured.has(vendor) && pattern.test(text)) {
      identified.add(vendor);
    }
  }

  return [...identified];
}
