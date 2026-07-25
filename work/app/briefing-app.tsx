import { useEffect, useMemo, useState } from "react";

export type EditorialLane = "executive" | "technical" | "research";

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
    targetMix: Record<EditorialLane, number>;
    selectedMix: Record<EditorialLane, number>;
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
    issueLabel: string;
    summary: string;
    timing: string;
    retainedRuns: number;
  }
> = {
  daily: {
    label: "Daily",
    issueLabel: "Today",
    summary:
      "Five consequential AI developments, ranked for decisions first, technical usefulness second, and research direction third.",
    timing: "Daily briefing · Melbourne",
    retainedRuns: 7,
  },
  weekly: {
    label: "Weekly",
    issueLabel: "This week",
    summary:
      "Ten consequential AI developments, ranked for decisions first, technical usefulness second, and research direction third.",
    timing: "Friday briefing · Melbourne",
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
    title: "For builders",
    description:
      "Tools and implementation shifts with a practical next move for delivery teams.",
  },
  research: {
    short: "Research",
    title: "Research watch",
    description:
      "A deliberately small selection chosen for the direction or consequence it reveals.",
  },
};

const laneOrder: EditorialLane[] = ["executive", "technical", "research"];

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

function formatTime(value: string) {
  return formatDate(value, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function sourceLabel(story: CollectedStory) {
  return (
    story.discoveredBy?.[0] ??
    story.originalDomain?.replace(/^www\./, "") ??
    "Source"
  );
}

function storyMatches(story: CollectedStory, query: string) {
  return [
    story.title,
    story.originalDomain,
    story.editorialLane,
    ...(story.discoveredBy ?? []),
    ...story.selectionReasons,
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

function SourceLinks({ story }: { story: CollectedStory }) {
  const links = (story.sourceAttributions ?? [])
    .filter(
      (source, index, all) =>
        source.sourceUrl &&
        all.findIndex((item) => item.sourceUrl === source.sourceUrl) === index,
    )
    .slice(0, 3);

  if (links.length === 0) return null;

  return (
    <div className="source-links" aria-label="Discovery sources">
      <span>Seen via</span>
      {links.map((source) => (
        <a
          href={source.sourceUrl}
          rel="noreferrer"
          target="_blank"
          key={source.sourceUrl}
        >
          {source.sourceName}
        </a>
      ))}
    </div>
  );
}

function StoryCard({
  story,
  lead = false,
}: {
  story: CollectedStory;
  lead?: boolean;
}) {
  return (
    <article
      className={`story-card ${lead ? "story-card--lead" : ""}`}
      data-story-card="true"
      data-story-id={story.id}
    >
      <div className="story-card__topline">
        <span className={`source-tag source-tag--${story.editorialLane}`}>
          <span aria-hidden="true" className="source-tag__mark">
            {sourceLabel(story).slice(0, 2).toLocaleUpperCase()}
          </span>
          {sourceLabel(story)}
        </span>
        <span className="story-card__meta">
          {formatDate(story.publishedAt)}
        </span>
      </div>

      <div className="story-card__body">
        <p className="story-card__category">
          {laneDetails[story.editorialLane].short}
        </p>
        <h3>
          <a href={story.url} rel="noreferrer" target="_blank">
            {story.title}
          </a>
        </h3>
        <p className="story-card__reason">
          {story.selectionReasons
            .filter((reason) => !reason.endsWith(" lane"))
            .slice(0, 2)
            .join(" · ")}
        </p>
      </div>

      <SourceLinks story={story} />

      <div className="story-card__footer">
        <span>{story.originalDomain?.replace(/^www\./, "")}</span>
        <a href={story.url} rel="noreferrer" target="_blank">
          Read source <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}

function CadenceView({ run }: { run: PublicationRun }) {
  const [query, setQuery] = useState("");
  const [activeLane, setActiveLane] = useState<"all" | EditorialLane>("all");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const visibleGroups = useMemo(
    () =>
      laneOrder
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
    [activeLane, normalizedQuery, run.items],
  );

  const visibleCount = visibleGroups.reduce(
    (total, group) => total + group.stories.length,
    0,
  );
  const isFiltered = activeLane !== "all" || normalizedQuery.length > 0;
  const publicationTime = run.publication?.publishedAt ?? run.generatedAt;
  const cadence = cadenceDetails[run.cadence];

  return (
    <>
      <section className="hero shell" aria-labelledby="brief-title">
        <div className="hero-copy">
          <div className="issue-line">
            <span>Latest {run.cadence} briefing</span>
            <span aria-hidden="true">/</span>
            <span>{formatDate(run.issueDate)}</span>
          </div>
          <h1 id="brief-title">
            The signal
            <br />
            <em>beneath the noise.</em>
          </h1>
          <p className="hero-summary">
            {cadence.summary}
          </p>
          <div className="hero-status">
            <span className="status-pill">Published automatically</span>
            <span>{cadence.timing}</span>
          </div>
        </div>

        <aside className="run-card" aria-label="Current run details">
          <span className="kicker">Current run</span>
          <strong>{formatDate(run.issueDate)}</strong>
          <dl>
            <div>
              <dt>Stories</dt>
              <dd>{run.items.length}</dd>
            </div>
            <div>
              <dt>Source health</dt>
              <dd>
                {run.sourceHealth.healthySources}/
                {run.sourceHealth.configuredSources} healthy
              </dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd>{formatTime(publicationTime)}</dd>
            </div>
          </dl>
          <a href={`#history-${run.cadence}`} className="text-link">
            View {run.cadence} history <span aria-hidden="true">→</span>
          </a>
        </aside>
      </section>

      <section className="brief-stats" aria-label="Briefing mix">
        <div className="shell brief-stats__inner">
          <div>
            <span className="stat-value">{run.items.length}</span>
            <span className="stat-label">ranked stories</span>
          </div>
          <div>
            <span className="stat-value">
              {run.editorialPolicy.selectedMix.executive}
            </span>
            <span className="stat-label">executive</span>
          </div>
          <div>
            <span className="stat-value">
              {run.editorialPolicy.selectedMix.technical}
            </span>
            <span className="stat-label">technical</span>
          </div>
          <div>
            <span className="stat-value">
              {run.editorialPolicy.selectedMix.research}
            </span>
            <span className="stat-label">research</span>
          </div>
        </div>
      </section>

      <section
        id="briefing"
        className="briefing shell"
        aria-labelledby="briefing-title"
      >
        <div className="briefing-heading">
          <div>
            <span className="kicker">{cadence.issueLabel}</span>
            <h2 id="briefing-title">The briefing</h2>
          </div>
          <p>
            Selected from diverse discovery sources, then linked back to the
            strongest available evidence.
          </p>
        </div>

        <div className="controls">
          <label className="search-control" htmlFor="brief-search">
            <span className="sr-only">Search stories</span>
            <span aria-hidden="true" className="search-control__icon">
              ⌕
            </span>
            <input
              id="brief-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the briefing"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                className="search-control__clear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                Clear
              </button>
            ) : null}
          </label>

          <div className="filter-group" role="group" aria-label="Filter by lane">
            <button
              type="button"
              data-filter="all"
              aria-pressed={activeLane === "all"}
              onClick={() => setActiveLane("all")}
            >
              All <span>{run.items.length}</span>
            </button>
            {laneOrder.map((lane) => (
              <button
                type="button"
                data-filter={lane}
                aria-pressed={activeLane === lane}
                onClick={() => setActiveLane(lane)}
                key={lane}
              >
                {laneDetails[lane].short}
                <span>{run.editorialPolicy.selectedMix[lane]}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="results-summary" aria-live="polite">
          {isFiltered
            ? `${visibleCount} ${visibleCount === 1 ? "story" : "stories"} shown`
            : `${run.items.length} briefing stories`}
        </p>

        {visibleGroups.length > 0 ? (
          <div className="sections">
            {visibleGroups.map(({ lane, stories }, groupIndex) => (
              <section
                className="brief-section"
                aria-labelledby={`${lane}-title`}
                key={lane}
              >
                <div className="section-heading">
                  <div>
                    <span className="section-index">
                      {String(laneOrder.indexOf(lane) + 1).padStart(2, "0")}
                    </span>
                    <h2 id={`${lane}-title`}>{laneDetails[lane].title}</h2>
                  </div>
                  <p>{laneDetails[lane].description}</p>
                </div>
                <div className="story-grid">
                  {stories.map((story, storyIndex) => (
                    <StoryCard
                      story={story}
                      lead={
                        groupIndex === 0 &&
                        storyIndex === 0 &&
                        !isFiltered
                      }
                      key={story.id}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="kicker">No matches</span>
            <h2>Nothing in this run matches that search.</h2>
            <button
              type="button"
              className="text-link text-link--button"
              onClick={() => {
                setQuery("");
                setActiveLane("all");
              }}
            >
              Clear filters
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

      {runs.length > 0 ? (
        <div className="history-list">
          {runs.map((run, index) => (
            <details
              className="history-run"
              open={index === 0}
              key={run.runId}
            >
              <summary>
                <span className="history-run__index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="history-run__title">
                  <strong>{formatDate(run.issueDate)}</strong>
                  <small>
                    {index === 0 ? "Current run" : "Previous run"} ·{" "}
                    {run.items.length} stories
                  </small>
                </span>
                <span className="history-run__mix">
                  {run.editorialPolicy.selectedMix.executive}/
                  {run.editorialPolicy.selectedMix.technical}/
                  {run.editorialPolicy.selectedMix.research}
                </span>
              </summary>

              <ol className="history-stories">
                {run.items.map((story) => (
                  <li key={story.id}>
                    <span
                      className={`lane-dot lane-dot--${story.editorialLane}`}
                    />
                    <a href={story.url} rel="noreferrer" target="_blank">
                      {story.title}
                    </a>
                    <span>{sourceLabel(story)}</span>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="kicker">Awaiting first accepted run</span>
          <h2>The {details.label} archive will appear here automatically.</h2>
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
            Scheduled GitHub runners read the same seven public feeds every day
            and for the Friday Weekly edition, or whenever a manual run starts.
          </p>
        </article>
        <i aria-hidden="true">→</i>
        <article>
          <span>02</span>
          <h2>Rank</h2>
          <p>
            Duplicates and promotional noise are reduced, then the strongest
            five Daily stories or ten Weekly stories are selected in their
            cadence-specific editorial mix.
          </p>
        </article>
        <i aria-hidden="true">→</i>
        <article>
          <span>03</span>
          <h2>Check</h2>
          <p>
            The run must be complete, source-healthy, uniquely linked, and
            evidence-ready before it can replace the current briefing.
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
              <dt>Community signal</dt>
              <dd>Hacker News</dd>
            </div>
            <div>
              <dt>Research direction</dt>
              <dd>Hugging Face Daily Papers</dd>
            </div>
            <div>
              <dt>Primary evidence</dt>
              <dd>OpenAI, Anthropic, and Google / Gemini</dd>
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
}: {
  seedRuns: RunsByCadence;
}) {
  const [activeView, setActiveView] = useState<ViewName>("daily");
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

          <span className="public-badge">
            <span aria-hidden="true" />
            Public briefing
          </span>
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
