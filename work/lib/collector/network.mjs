import { setTimeout as wait } from "node:timers/promises";
import { assertSafePublicUrl, canonicalizeUrl } from "./shared.mjs";

const DEFAULT_HEADERS = {
  accept:
    "text/html, application/json, application/xml, text/xml;q=0.9, */*;q=0.5",
  "user-agent": "AIWeeklyBrief/0.1 (local editorial source collector)",
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

async function request(url, options) {
  const {
    timeoutMs,
    headers,
    method = "GET",
    maxRedirects,
  } = options;
  let currentUrl = assertSafePublicUrl(url).toString();

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      method,
      headers: { ...DEFAULT_HEADERS, ...headers },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.has("location")
    ) {
      if (redirectCount === maxRedirects) {
        await response.body?.cancel();
        throw new Error(`Too many redirects while fetching ${url}`);
      }

      const nextUrl = new URL(response.headers.get("location"), currentUrl);
      assertSafePublicUrl(nextUrl);
      currentUrl = nextUrl.toString();
      await response.body?.cancel();
      continue;
    }

    return { response, finalUrl: currentUrl };
  }

  throw new Error(`Unable to fetch ${url}`);
}

export async function fetchText(
  url,
  {
    timeoutMs = 15_000,
    maxBytes = 2_000_000,
    maxRedirects = 5,
    retries = 2,
    headers,
  } = {},
) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = performance.now();
    try {
      const { response, finalUrl } = await request(url, {
        timeoutMs,
        maxRedirects,
        headers,
      });

      if (!response.ok) {
        await response.body?.cancel();
        const error = new Error(`HTTP ${response.status} while fetching ${url}`);
        error.status = response.status;
        throw error;
      }

      const announcedLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(announcedLength) && announcedLength > maxBytes) {
        await response.body?.cancel();
        throw new Error(`Response is larger than ${maxBytes} bytes: ${url}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxBytes) {
        throw new Error(`Response is larger than ${maxBytes} bytes: ${url}`);
      }

      return {
        text: buffer.toString("utf8"),
        finalUrl,
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        durationMs: Math.round(performance.now() - startedAt),
        bytes: buffer.length,
      };
    } catch (error) {
      lastError = error;
      const retryable =
        error?.name === "TimeoutError" ||
        error?.name === "AbortError" ||
        RETRYABLE_STATUS.has(error?.status);

      if (!retryable || attempt === retries) break;
      await wait(250 * 2 ** attempt);
    }
  }

  throw lastError;
}

export async function resolveTrackingUrl(
  value,
  {
    trackingHosts = ["links.tldrnewsletter.com", "a.tldrnewsletter.com"],
    timeoutMs = 10_000,
    maxRedirects = 5,
  } = {},
) {
  let currentUrl = canonicalizeUrl(value);
  if (!currentUrl) return null;

  for (let redirectCount = 0; redirectCount < maxRedirects; redirectCount += 1) {
    const current = new URL(currentUrl);
    if (!trackingHosts.includes(current.hostname.toLocaleLowerCase())) {
      return canonicalizeUrl(currentUrl);
    }

    assertSafePublicUrl(current);
    const response = await fetch(current, {
      method: "GET",
      headers: DEFAULT_HEADERS,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    const location = response.headers.get("location");
    await response.body?.cancel();

    if (
      response.status < 300 ||
      response.status >= 400 ||
      !location
    ) {
      return canonicalizeUrl(currentUrl);
    }

    const next = new URL(location, current);
    assertSafePublicUrl(next);
    currentUrl = next.toString();
  }

  return canonicalizeUrl(currentUrl);
}
