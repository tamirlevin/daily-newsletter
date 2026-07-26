const PUBLISHER_BY_DOMAIN = Object.freeze({
  "anthropic.com": "Anthropic",
  "arxiv.org": "arXiv",
  "blog.google": "Google Research",
  "cerebras.ai": "Cerebras",
  "github.com": "GitHub",
  "huggingface.co": "Hugging Face",
  "lmstudio.ai": "LM Studio",
  "openai.com": "OpenAI",
  "wsj.com": "The Wall Street Journal",
});

const LANE_LABELS = Object.freeze({
  executive: "Executive Signal",
  technical: "For Builders",
  research: "Research Watch",
});

function normalize(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function hostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function domainLabel(domain) {
  if (!domain) return "Source";
  if (PUBLISHER_BY_DOMAIN[domain]) return PUBLISHER_BY_DOMAIN[domain];

  const name = domain.split(".")[0].replaceAll("-", " ");
  return name.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

export function publisherLabel(story) {
  const domain =
    String(story.originalDomain ?? "").replace(/^www\./, "") ||
    hostname(story.url);
  const exactAttribution = (story.sourceAttributions ?? []).find(
    (source) =>
      source.sourceUrl === story.url ||
      (hostname(source.sourceUrl) === domain &&
        !String(source.sourceName).toLocaleLowerCase().includes("hacker news")),
  );

  return PUBLISHER_BY_DOMAIN[domain] || exactAttribution?.sourceName ||
    domainLabel(domain);
}

export function discoveryLabel(story) {
  const publisher = normalize(publisherLabel(story));
  const sources = [...new Set(story.discoveredBy ?? [])].filter(
    (source) => normalize(source) !== publisher,
  );
  return sources.length > 0 ? sources.join(" + ") : "";
}

export function storyMatches(story, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;

  return normalize(
    [
      story.title,
      story.briefSummary,
      story.originalDomain,
      publisherLabel(story),
      discoveryLabel(story),
      LANE_LABELS[story.editorialLane],
      ...(story.selectionReasons ?? []),
    ].join(" "),
  ).includes(normalizedQuery);
}

export function issueStoryNumber(items, story) {
  const index = items.findIndex((item) => item.id === story.id);
  return index >= 0 ? index + 1 : 0;
}

export function historyRunMatches(run, query, formattedIssueDate = "") {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;

  if (
    normalize(`${run.issueDate} ${formattedIssueDate}`).includes(normalizedQuery)
  ) {
    return true;
  }

  return (run.items ?? []).some((story) => storyMatches(story, normalizedQuery));
}

export function visibleHistoryStories(
  run,
  query,
  formattedIssueDate = "",
) {
  const normalizedQuery = normalize(query);
  if (
    !normalizedQuery ||
    normalize(`${run.issueDate} ${formattedIssueDate}`).includes(normalizedQuery)
  ) {
    return run.items ?? [];
  }

  return (run.items ?? []).filter((story) =>
    storyMatches(story, normalizedQuery),
  );
}

export { LANE_LABELS };
