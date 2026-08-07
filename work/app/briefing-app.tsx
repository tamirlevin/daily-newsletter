import { useEffect, useMemo, useState } from "react";
import {
  discoveryLabel,
  historyRunMatches,
  issueStoryNumber,
  publisherLabel,
  storyMatches,
  visibleHistoryStories,
} from "./briefing-filters.mjs";

export type EditorialLane =
  | "executive"
  | "technical"
  | "builder"
  | "research";

type SourceAttribution = {
  sourceName: string;
  sourceUrl: string;
};

export type CollectedStory = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  editorialLane: EditorialLane;
  briefSummary?: string;
  summaryStatus?: "generated" | "unavailable" | "not-generated";
  readingTime?: string | null;
  originalDomain?: string;
  discoveredBy?: string[];
  sourceAttributions?: SourceAttribution[];
  selectionReasons: string[];
  flags?: {
    originatedOnX?: boolean;
  };
};

export type PublicationRun = {
  schemaVersion: number;
  kind: "collection-draft";
  cadence: "daily" | "weekly";
  runId: string;
  issueDate: string;
  generatedAt: string;
  status: string;
  period: {
    start: string;
    end: string;
    lookbackDays: number;
  };
  editorialPolicy: {
    profile: "daily" | "weekly";
    targetMix: Partial<Record<EditorialLane, number>>;
    selectedMix: Partial<Record<EditorialLane, number>>;
    directXCoverage?: {
      capturedFromConfiguredSources: number;
      selected: number;
      directIngestionStatus: string;
    };
  };
  sourceHealth: {
    status: string;
    healthySources: number;
    configuredSources: number;
  };
  publication?: {
    method: "automatic";
    publishedAt: string;
  };
  items: CollectedStory[];
};

type Cadence = "daily" | "weekly";
type ViewName =
  | "daily"
  | "weekly"
  | "history-daily"
  | "history-weekly"
  | "system";

type RunsByCadence = Record<Cadence, PublicationRun[]>;

const cadenceDetails: Record<
  Cadence,
  {
    label: string;
    retainedRuns: number;
  }
> = {
  daily: {
    label: "Daily",
    retainedRuns: 7,
  },
  weekly: {
    label: "Weekly",
    retainedRuns: 3,
  },
};

const laneDetails: Record<
  EditorialLane,
  { short: string; title: string; description: string }
> = {
  executive: {
    short: "Executive",
    title: "Executive signal",
    description:
      "Developments most likely to change a decision, operating assumption, or market view.",
  },
  technical: {
    short: "Technical",
    title: "Technical signal",
    description:
      "Architecture, implementation, and performance shifts that reward a closer technical read.",
  },
  builder: {
    short: "Builders",
    title: "Builder signal",
    description:
      "A useful new tool, protocol, platform, or workflow with a practical next move.",
  },
  research: {
    short: "Research",
    title: "Research watch",
    description:
      "A deliberately small selection chosen for the direction or consequence it reveals.",
  },
};

const laneOrder: EditorialLane[] = [
  "executive",
  "technical",
  "builder",
  "research",
];

function lanesInRun(run: PublicationRun) {
  const present = new Set(run.items.map((story) => story.editorialLane));
  return laneOrder.filter((lane) => present.has(lane));
}

function mixLabel(run: PublicationRun) {
  const mix = run.editorialPolicy.selectedMix;
  return [
    mix.executive ?? 0,
    mix.technical ?? 0,
    mix.builder ?? mix.research ?? 0,
  ].join("/");
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
}

function fallbackSummary(story: CollectedStory) {
  const reasons = story.selectionReasons
    .filter((reason) => !reason.endsWith(" lane"))
    .slice(0, 2)
    .join(" and ");
  return reasons
    ? `This item was selected for ${reasons}. Open the linked source for the full published context.`
    : "Open the linked source for the full published context.";
}

function StoryRow({
  story,
  index,
}: {
  story: CollectedStory;
  index: number;
}) {
  const discovery = discoveryLabel(story);
  const summary =
    story.briefSummary ??
    (story.summaryStatus === "unavailable" ? null : fallbackSummary(story));
  const meta = [
    publisherLabel(story),
    formatDate(story.publishedAt),
    story.originalDomain?.replace(/^www\./, ""),
    discovery ? `found via ${discovery}` : "",
  ].filter(Boolean);

  return (
    <article
      className="story-row"
      data-story-id={story.id}
    >
      <span className="story-row__index" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="story-row__content">
        <h3>
          <a href={story.url} rel="noreferrer" target="_blank">
            {story.title}
          </a>
        </h3>
        {summary ? <p className="story-row__summary">{summary}</p> : null}
        <p className="story-row__meta">{meta.join(" · ")}</p>
      </div>
    </article>
  );
}

function CadenceView({ run }: { run: PublicationRun }) {
  const [query, setQuery] = useState("");
  const [activeLane, setActiveLane] = useState<"all" | EditorialLane>("all");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const runLanes = useMemo(() => lanesInRun(run), [run]);

  const visibleGroups = useMemo(
    () =>
      runLanes
        .filter((lane) => activeLane === "all" || activeLane === lane)
        .map((lane) => ({
          lane,
          stories: run.items.filter(
            (story) =>
              story.editorialLane === lane &&
              storyMatches(story, normalizedQuery),
          ),
        }))
        .filter((group) => group.stories.length > 0),
    [activeLane, normalizedQuery, run.items, runLanes],
  );

  const visibleCount = visibleGroups.reduce(
    (total, group) => total + group.stories.length,
    0,
  );
  const isFiltered = activeLane !== "all" || normalizedQuery.length > 0;
  const cadence = cadenceDetails[run.cadence];
  const searchId = `brief-search-${run.cadence}`;
  const showControls = run.cadence === "weekly";

  return (
    <>
      <section className="issue-header shell" aria-labelledby="brief-title">
        <div className="issue-header__dateline">
          <h1 id="brief-title">{cadence.label} briefing</h1>
          <span aria-hidden="true">·</span>
          <time dateTime={run.issueDate}>
            {formatDate(run.issueDate, {
              weekday: "long",
              month: "long",
            })}
          </time>
        </div>
        <p className="issue-header__status">
          {run.items.length} stories · Published automatically
        </p>
      </section>

      <section
        id="briefing"
        className="briefing shell"
        aria-labelledby="briefing-title"
      >
        <h2 id="briefing-title" className="sr-only">
          {cadence.label} stories
        </h2>

        {showControls ? (
          <>
            <div className="controls">
              <label className="search-control" htmlFor={searchId}>
                <span className="sr-only">Search this Weekly issue</span>
                <span aria-hidden="true" className="search-control__icon">
                  ⌕
                </span>
                <input
                  id={searchId}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search this issue"
                  autoComplete="off"
                />
                {query ? (
                  <button
                    type="button"
                    className="search-control__clear"
                    onClick={() => setQuery("")}
                    aria-label="Clear Weekly search"
                  >
                    Clear
                  </button>
                ) : null}
              </label>

              <div
                className="filter-group"
                role="group"
                aria-label="Filter Weekly stories by category"
              >
                <button
                  type="button"
                  data-filter="all"
                  aria-pressed={activeLane === "all"}
                  onClick={() => setActiveLane("all")}
                >
                  All
                </button>
                {runLanes.map((lane) => (
                  <button
                    type="button"
                    data-filter={lane}
                    aria-pressed={activeLane === lane}
                    onClick={() => setActiveLane(lane)}
                    key={lane}
                  >
                    {laneDetails[lane].short}
                  </button>
                ))}
              </div>
            </div>
            <p className="results-summary" aria-live="polite">
              {isFiltered
                ? `${visibleCount} ${visibleCount === 1 ? "story" : "stories"} shown`
                : `${run.items.length} stories`}
            </p>
          </>
        ) : null}

        {visibleGroups.length > 0 ? (
          <div className="sections">
            {visibleGroups.map(({ lane, stories }) => (
              <section
                className={`brief-section brief-section--${lane}`}
                aria-labelledby={`${run.cadence}-${lane}-title`}
                key={lane}
              >
                <div className="section-heading">
                  <div>
                    <h2 id={`${run.cadence}-${lane}-title`}>
                      {laneDetails[lane].title}
                    </h2>
                  </div>
                  <p>{laneDetails[lane].description}</p>
                </div>
                <div className="story-list">
                  {stories.map((story) => (
                    <StoryRow
                      story={story}
                      index={issueStoryNumber(run.items, story) - 1}
                      key={story.id}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="empty-state" aria-live="polite">
            <span className="kicker">No matches</span>
            <h2>Nothing in this Weekly issue matches that search.</h2>
            <button
              type="button"
              className="text-link text-link--button"
              onClick={() => {
                setQuery("");
                setActiveLane("all");
              }}
            >
              Clear search and filters
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function HistoryView({
  cadence,
  runs,
}: {
  cadence: Cadence;
  runs: PublicationRun[];
}) {
  const details = cadenceDetails[cadence];
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredRuns = useMemo(
    () =>
      runs.filter((run) =>
        historyRunMatches(
          run,
          normalizedQuery,
          formatDate(run.issueDate, {
            weekday: "long",
            month: "long",
          }),
        ),
      ),
    [normalizedQuery, runs],
  );
  const searchId = `history-search-${cadence}`;

  return (
    <section className="subpage shell" aria-labelledby="history-title">
      <div className="subpage-hero">
        <span className="kicker">
          {details.retainedRuns}-run {cadence} archive
        </span>
        <h1 id="history-title">
          Recent {details.label.toLocaleLowerCase()} <em>history.</em>
        </h1>
        <p>
          The current {cadence} briefing and its most recent successful
          predecessors. Older {cadence} runs are removed automatically without
          affecting {cadence === "daily" ? "Weekly" : "Daily"} history.
        </p>
        <div className="history-switch" aria-label="Choose history cadence">
          {(["daily", "weekly"] as Cadence[]).map((option) => (
            <a
              href={`#history-${option}`}
              aria-current={option === cadence ? "page" : undefined}
              key={option}
            >
              {cadenceDetails[option].label}
            </a>
          ))}
        </div>
      </div>

      <div className="history-controls">
        <label className="history-search" htmlFor={searchId}>
          <span>Search {details.label} History</span>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Date, headline, publisher, or category"
            autoComplete="off"
          />
        </label>
        {query ? (
          <button
            type="button"
            className="history-search__clear"
            onClick={() => setQuery("")}
          >
            Clear search
          </button>
        ) : null}
        <p aria-live="polite">
          {filteredRuns.length}{" "}
          {filteredRuns.length === 1 ? "issue" : "issues"}
        </p>
      </div>

      {filteredRuns.length > 0 ? (
        <div className="history-list">
          {filteredRuns.map((run, index) => {
            const formattedIssueDate = formatDate(run.issueDate, {
              weekday: "long",
              month: "long",
            });
            const visibleStories = visibleHistoryStories(
              run,
              normalizedQuery,
              formattedIssueDate,
            );

            return (
              <details
                className="history-run"
                open={normalizedQuery.length > 0 || index === 0}
                key={run.runId}
              >
                <summary>
                  <span className="history-run__index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="history-run__title">
                    <strong>{formattedIssueDate}</strong>
                    <small>
                      {index === 0 && !normalizedQuery
                        ? "Current run"
                        : "Successful run"}{" "}
                      · {run.items.length} stories
                    </small>
                  </span>
                  <span className="history-run__mix">
                    {mixLabel(run)}
                  </span>
                </summary>

                <ol className="history-stories">
                  {visibleStories.map((story) => (
                    <li key={story.id}>
                      <span
                        className={`lane-dot lane-dot--${story.editorialLane}`}
                      />
                      <a href={story.url} rel="noreferrer" target="_blank">
                        {story.title}
                      </a>
                      <span>
                        {publisherLabel(story)} ·{" "}
                        {laneDetails[story.editorialLane].title}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            );
          })}
        </div>
      ) : (
        <div className="empty-state" aria-live="polite">
          <span className="kicker">
            {runs.length === 0 ? "Awaiting first accepted run" : "No matches"}
          </span>
          <h2>
            {runs.length === 0
              ? `The ${details.label} archive will appear here automatically.`
              : `Nothing in ${details.label} History matches that search.`}
          </h2>
          {runs.length > 0 ? (
            <button
              type="button"
              className="text-link text-link--button"
              onClick={() => setQuery("")}
            >
              Clear search
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function SystemView() {
  return (
    <section className="subpage system-page shell" aria-labelledby="system-title">
      <div className="subpage-hero">
        <span className="kicker">High-level architecture</span>
        <h1 id="system-title">
          How it <em>comes together.</em>
        </h1>
        <p>
          GitHub runs the collectors. Sites serves the public reader, accepts a
          valid run, keeps separate Daily and Weekly archives, and releases the
          Daily email only after acceptance.
        </p>
      </div>

      <div className="system-flow" aria-label="Publishing flow">
        <article>
          <span>01</span>
          <h2>Collect</h2>
          <p>
            Scheduled GitHub runners read the same focused public sources every day
            and for the Friday Weekly edition, or whenever a manual run starts.
          </p>
        </article>
        <i aria-hidden="true">→</i>
        <article>
          <span>02</span>
          <h2>Rank + summarise</h2>
          <p>
            Duplicates and promotional noise are reduced, then the strongest
            five Daily stories or ten Weekly stories are selected in their
            cadence-specific editorial mix. Concise, evidence-grounded
            summaries are added when generation succeeds.
          </p>
        </article>
        <i aria-hidden="true">→</i>
        <article>
          <span>03</span>
          <h2>Check</h2>
          <p>
            The run must be complete, source-healthy, uniquely linked, and
            evidence-ready before it can replace the current briefing. A
            summary failure leaves that selected story as a source-linked
            headline instead of blocking the issue.
          </p>
        </article>
        <i aria-hidden="true">→</i>
        <article>
          <span>04</span>
          <h2>Publish</h2>
          <p>
            Sites stores the issue in the correct archive. Accepted Daily runs
            then trigger one idempotent email; rejected runs never send.
          </p>
        </article>
      </div>

      <div className="system-grid">
        <article className="system-panel">
          <span className="kicker">Source roles</span>
          <h2>Diversity for discovery. Authority for evidence.</h2>
          <dl className="source-role-list">
            <div>
              <dt>Broad discovery</dt>
              <dd>TLDR AI and AlphaSignal</dd>
            </div>
            <div>
              <dt>Independent reporting</dt>
              <dd>InfoQ AI/ML News</dd>
            </div>
            <div>
              <dt>Practitioner + community</dt>
              <dd>Simon Willison and Hacker News</dd>
            </div>
            <div>
              <dt>Primary evidence</dt>
              <dd>
                Cloudflare Agents, the MCP project, OpenAI, Anthropic, and
                Google / Gemini
              </dd>
            </div>
          </dl>
        </article>

        <article className="system-panel system-panel--accent">
          <span className="kicker">Quiet safeguards</span>
          <h2>The last good briefing always wins.</h2>
          <ul>
            <li>A failed or incomplete run is rejected before publication.</li>
            <li>Publishing is authenticated; the write endpoint is not open.</li>
            <li>
              Re-running the same Daily or Weekly issue does not create a
              duplicate.
            </li>
            <li>
              The Daily email is sent only after Sites has accepted and stored
              that exact issue.
            </li>
            <li>
              X links found inside trusted feeds can appear; there is no
              separate X collector or user-account dependency.
            </li>
          </ul>
        </article>

        <article className="system-panel system-panel--durability">
          <div className="durability-copy">
            <span className="kicker">Durability &amp; session control</span>
            <h2>Built to be resumed, not remembered.</h2>
            <p>
              The application and its operating memory live together in
              version control. The repository&apos;s boot file gives every new
              Codex session the same architecture, durable decisions, safe
              change paths, and release checks—so control stays with the
              project rather than any single conversation.
            </p>
            <div className="repository-links" aria-label="Project repository">
              <a
                href="https://github.com/tamirlevin/daily-newsletter"
                rel="noreferrer"
                target="_blank"
              >
                Open the repository <span aria-hidden="true">↗</span>
              </a>
              <a
                href="https://github.com/tamirlevin/daily-newsletter/blob/main/AGENTS.md"
                rel="noreferrer"
                target="_blank"
              >
                Read the session boot file
              </a>
            </div>
          </div>

          <dl className="durability-list">
            <div>
              <dt>Durability</dt>
              <dd>
                Source, architecture, and operating memory survive individual
                sessions.
              </dd>
            </div>
            <div>
              <dt>Session control</dt>
              <dd>
                New Codex sessions load the repository instructions before
                making changes.
              </dd>
            </div>
            <div>
              <dt>Change discipline</dt>
              <dd>
                Invariants, file maps, tests, and deployment checks make
                handoffs repeatable.
              </dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  );
}

function viewFromHash(): ViewName {
  if (typeof window === "undefined") return "daily";
  const value = window.location.hash.replace("#", "");
  return [
    "daily",
    "weekly",
    "history-daily",
    "history-weekly",
    "system",
  ].includes(value)
    ? (value as ViewName)
    : "daily";
}

function AwaitingCadence({ cadence }: { cadence: Cadence }) {
  return (
    <section className="subpage shell" aria-labelledby="awaiting-title">
      <div className="subpage-hero">
        <span className="kicker">Awaiting first accepted run</span>
        <h1 id="awaiting-title">
          The {cadenceDetails[cadence].label} briefing is <em>on its way.</em>
        </h1>
        <p>
          The last good briefing remains in place until Sites accepts a
          complete, source-healthy {cadence} run.
        </p>
      </div>
    </section>
  );
}

export function BriefingApp({
  seedRuns,
  initialView = "daily",
}: {
  seedRuns: RunsByCadence;
  initialView?: ViewName;
}) {
  const [activeView, setActiveView] = useState<ViewName>(initialView);
  const [runsByCadence, setRunsByCadence] =
    useState<RunsByCadence>(seedRuns);

  useEffect(() => {
    function syncView() {
      setActiveView(viewFromHash());
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    syncView();
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRuns() {
      try {
        const responses = await Promise.all(
          (["daily", "weekly"] as Cadence[]).map(async (cadence) => {
            const response = await fetch(`/api/runs?cadence=${cadence}`, {
              signal: controller.signal,
              headers: { accept: "application/json" },
            });
            if (!response.ok) return [cadence, null] as const;
            const data = (await response.json()) as {
              runs?: PublicationRun[];
            };
            return [
              cadence,
              Array.isArray(data.runs) && data.runs.length > 0
                ? data.runs
                : null,
            ] as const;
          }),
        );
        setRunsByCadence((current) => {
          const next = { ...current };
          for (const [cadence, runs] of responses) {
            if (runs) next[cadence] = runs;
          }
          return next;
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          // The embedded run remains available if the live store is unreachable.
        }
      }
    }

    void loadRuns();
    return () => controller.abort();
  }, []);

  const navItems: Array<{
    href: ViewName;
    label: string;
    active: boolean;
  }> = [
    {
      href: "daily",
      label: "Daily",
      active: activeView === "daily",
    },
    {
      href: "weekly",
      label: "Weekly",
      active: activeView === "weekly",
    },
    {
      href: "history-daily",
      label: "History",
      active: activeView.startsWith("history-"),
    },
    {
      href: "system",
      label: "How it works",
      active: activeView === "system",
    },
  ];
  const dailyRun = runsByCadence.daily[0];
  const weeklyRun = runsByCadence.weekly[0];

  return (
    <>
      <a className="skip-link" href="#view-content">
        Skip to content
      </a>

      <header className="site-header">
        <div className="shell header-inner">
          <a className="wordmark" href="#daily" aria-label="AI Brief home">
            <span className="wordmark__signal" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              AI <em>Daily + Weekly</em> Brief
            </span>
          </a>

          <nav className="header-nav" aria-label="Main navigation">
            {navItems.map((item) => (
              <a
                href={`#${item.href}`}
                aria-current={item.active ? "page" : undefined}
                key={item.href}
              >
                {item.label}
              </a>
            ))}
          </nav>

        </div>
      </header>

      <main id="view-content">
        {activeView === "daily" && dailyRun ? (
          <CadenceView run={dailyRun} />
        ) : null}
        {activeView === "daily" && !dailyRun ? (
          <AwaitingCadence cadence="daily" />
        ) : null}
        {activeView === "weekly" && weeklyRun ? (
          <CadenceView run={weeklyRun} />
        ) : null}
        {activeView === "weekly" && !weeklyRun ? (
          <AwaitingCadence cadence="weekly" />
        ) : null}
        {activeView === "history-daily" ? (
          <HistoryView cadence="daily" runs={runsByCadence.daily} />
        ) : null}
        {activeView === "history-weekly" ? (
          <HistoryView cadence="weekly" runs={runsByCadence.weekly} />
        ) : null}
        {activeView === "system" ? <SystemView /> : null}
      </main>

      <footer className="site-footer">
        <div className="shell">
          <span>AI Daily + Weekly Brief</span>
          <span>Signal over volume · refreshed automatically</span>
        </div>
      </footer>
    </>
  );
}
