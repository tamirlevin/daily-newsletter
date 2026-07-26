import { createHash } from "node:crypto";
import { isIP } from "node:net";

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "source",
  "trk",
  "via",
]);

export function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function normalizeWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

export function stableId(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

export function parseIsoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export function canonicalizeUrl(value, base) {
  if (!value) return null;

  let url;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) return null;

  url.hash = "";
  url.hostname = url.hostname.toLocaleLowerCase();

  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLocaleLowerCase().startsWith("utm_") ||
      TRACKING_PARAMETERS.has(key.toLocaleLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }

  url.searchParams.sort();

  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

export function titleFromUrl(value) {
  try {
    const url = new URL(value);
    const slug = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return normalizeWhitespace(
      decodeURIComponent(slug)
        .replace(/[-_]+/g, " ")
        .replace(/\b([a-z])/g, (match) => match.toLocaleUpperCase()),
    );
  } catch {
    return "";
  }
}

export function isWithinWindow(dateValue, asOf, lookbackDays) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.valueOf())) return false;

  const end = new Date(asOf);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - lookbackDays);

  return date >= start && date <= end;
}

export function localDateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [
      part.type,
      part.value,
    ]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function isPrivateIpv4(hostname) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some(Number.isNaN)) return false;

  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    octets[0] === 0
  );
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.toLocaleLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

export function assertSafePublicUrl(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLocaleLowerCase();

  if (url.protocol !== "https:") {
    throw new Error(`Only HTTPS sources are allowed: ${url}`);
  }

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error(`Local source host is not allowed: ${hostname}`);
  }

  const ipVersion = isIP(hostname);
  if (
    (ipVersion === 4 && isPrivateIpv4(hostname)) ||
    (ipVersion === 6 && isPrivateIpv6(hostname))
  ) {
    throw new Error(`Private source address is not allowed: ${hostname}`);
  }

  return url;
}

export async function mapWithConcurrency(
  values,
  concurrency,
  mapper,
) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, values.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export function publicCandidate(candidate) {
  const safeCandidate = { ...candidate };
  delete safeCandidate.editorialText;
  delete safeCandidate.preliminaryTitle;
  delete safeCandidate.summaryEvidenceText;
  return safeCandidate;
}
