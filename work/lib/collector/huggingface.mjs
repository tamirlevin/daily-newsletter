import {
  canonicalizeUrl,
  isWithinWindow,
  normalizeWhitespace,
  parseIsoDate,
} from "./shared.mjs";

const DAY_MS = 86_400_000;

export function isoWeekKey(value) {
  const date = new Date(value);
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc - yearStart) / DAY_MS + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weeksInWindow(asOf, lookbackDays) {
  const end = new Date(asOf);
  const start = new Date(end.valueOf() - lookbackDays * DAY_MS);
  const weeks = new Set();
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor = new Date(cursor.valueOf() + DAY_MS)
  ) {
    weeks.add(isoWeekKey(cursor));
  }
  return [...weeks];
}

export function parseHuggingFacePapers(json) {
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  if (!Array.isArray(parsed)) {
    throw new Error("Hugging Face response is not an array");
  }

  return parsed
    .map((entry) => {
      const paper = entry.paper ?? {};
      const id = normalizeWhitespace(paper.id ?? entry.id);
      const submittedAt = parseIsoDate(
        paper.submittedOnDailyAt ??
          entry.submittedOnDailyAt ??
          entry.publishedAt,
      );
      const publishedAt = parseIsoDate(
        paper.publishedAt ?? entry.publishedAt,
      );

      return {
        id,
        title: normalizeWhitespace(entry.title ?? paper.title),
        summary: normalizeWhitespace(entry.summary ?? paper.summary),
        submittedAt,
        publishedAt,
        upvotes: Number(paper.upvotes ?? entry.upvotes ?? 0),
        comments: Number(entry.numComments ?? 0),
        organization: normalizeWhitespace(
          paper.organization?.fullname ??
            entry.organization?.fullname ??
            paper.organization?.name ??
            entry.organization?.name,
        ),
        projectPage: canonicalizeUrl(
          paper.projectPage ?? entry.projectPage,
        ),
      };
    })
    .filter(
      (paper) =>
        paper.id && paper.title && paper.submittedAt && paper.publishedAt,
    );
}

function requestUrl(source, week) {
  const url = new URL(source.apiUrl);
  url.searchParams.set("week", week);
  url.searchParams.set("sort", source.sort ?? "trending");
  url.searchParams.set("limit", String(source.limitPerWeek ?? 50));
  url.searchParams.set("p", "0");
  return url.toString();
}

export async function collectHuggingFace({
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
  const paperLists = await Promise.all(
    weeksInWindow(asOf, lookbackDays).map(async (week) => {
      const response = await fetchText(requestUrl(source, week));
      health.requests += 1;
      return parseHuggingFacePapers(response.text);
    }),
  );
  const papers = [
    ...new Map(
      paperLists.flat().map((paper) => [paper.id, paper]),
    ).values(),
  ];
  const maxPaperAgeDays = source.maxPaperAgeDays ?? 45;
  const eligible = papers
    .filter((paper) => {
      const ageDays =
        (new Date(asOf).valueOf() - new Date(paper.publishedAt).valueOf()) /
        DAY_MS;
      return (
        isWithinWindow(paper.submittedAt, asOf, lookbackDays) &&
        ageDays >= 0 &&
        ageDays <= maxPaperAgeDays
      );
    })
    .sort(
      (left, right) =>
        right.upvotes - left.upvotes ||
        new Date(right.submittedAt) - new Date(left.submittedAt),
    )
    .slice(0, source.maxCandidates ?? 50);

  const candidates = eligible.map((paper) => {
    const paperUrl = `https://arxiv.org/abs/${encodeURIComponent(paper.id)}`;
    const hubUrl = `https://huggingface.co/papers/${encodeURIComponent(paper.id)}`;
    return {
      title: paper.title,
      url: paperUrl,
      publishedAt: paper.publishedAt,
      section: "Research Watch",
      editorialText: normalizeWhitespace(
        `${paper.title} ${paper.summary} research paper benchmark study`,
      ),
      sourceRole: source.role,
      sourceKind: source.kind,
      engagement: {
        upvotes: paper.upvotes,
        comments: paper.comments,
      },
      paperMetadata: {
        paperId: paper.id,
        submittedAt: paper.submittedAt,
        organization: paper.organization || null,
        projectPage: paper.projectPage,
      },
      evidenceUrls: [
        paperUrl,
        hubUrl,
        ...(paper.projectPage ? [paper.projectPage] : []),
      ],
      sourceAttributions: [
        {
          sourceId: source.id,
          sourceName: source.name,
          sourceRole: source.role,
          sourceKind: source.kind,
          sourceUrl: hubUrl,
          section: "Daily Papers",
          vendor: null,
        },
      ],
    };
  });

  health.fetchedItems = papers.length;
  health.acceptedCandidates = candidates.length;
  health.discardedItems = Math.max(0, papers.length - candidates.length);
  return { candidates, health };
}
