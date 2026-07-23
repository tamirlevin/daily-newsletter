import { useMemo, useState } from "react";

type Story = {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  source: string;
  sourceClass: string;
  category: string;
  meta: string;
  state: string;
  priority: "lead" | "standard";
  url?: string;
};

type BriefSection = {
  id: string;
  shortTitle: string;
  title: string;
  description: string;
  stories: Story[];
};

export type BriefIssue = {
  schemaVersion: number;
  title: string;
  issue: string;
  label: string;
  status: string;
  generatedAt: string;
  period: string;
  summary: string;
  review: {
    decision: string;
    recommendation: string;
    sourceHealth: string;
    itemsReviewed: number;
    totalItems: number;
    note: string;
  };
  sections: BriefSection[];
};

function storyMatches(story: Story, query: string) {
  const searchable = [
    story.title,
    story.summary,
    story.whyItMatters,
    story.source,
    story.category,
  ]
    .join(" ")
    .toLocaleLowerCase();

  return searchable.includes(query);
}

function StoryCard({ story }: { story: Story }) {
  return (
    <article
      className={`story-card ${
        story.priority === "lead" ? "story-card--lead" : ""
      }`}
      data-story-card="true"
      data-story-id={story.id}
    >
      <div className="story-card__topline">
        <span className={`source-tag source-tag--${story.sourceClass}`}>
          <span aria-hidden="true" className="source-tag__mark">
            {story.source.slice(0, 2).toLocaleUpperCase()}
          </span>
          {story.source}
        </span>
        <span className="story-card__meta">{story.meta}</span>
      </div>

      <div className="story-card__body">
        <p className="story-card__category">{story.category}</p>
        <h3>{story.title}</h3>
        <p className="story-card__summary">{story.summary}</p>
      </div>

      <div className="story-card__reason">
        <span>Why it matters</span>
        <p>{story.whyItMatters}</p>
      </div>

      <div className="story-card__footer">
        <span>{story.state}</span>
        <span aria-hidden="true">•</span>
        {story.url ? (
          <a href={story.url} rel="noreferrer" target="_blank">
            Read source <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <span>Source link pending</span>
        )}
      </div>
    </article>
  );
}

export function BriefingApp({ issue }: { issue: BriefIssue }) {
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState("all");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const visibleSections = useMemo(
    () =>
      issue.sections
        .filter(
          (section) =>
            activeSection === "all" || section.id === activeSection,
        )
        .map((section) => ({
          ...section,
          stories: section.stories.filter((story) =>
            storyMatches(story, normalizedQuery),
          ),
        }))
        .filter((section) => section.stories.length > 0),
    [activeSection, issue.sections, normalizedQuery],
  );

  const visibleCount = visibleSections.reduce(
    (total, section) => total + section.stories.length,
    0,
  );
  const totalCount = issue.sections.reduce(
    (total, section) => total + section.stories.length,
    0,
  );
  const isFiltered = activeSection !== "all" || normalizedQuery.length > 0;

  function clearFilters() {
    setQuery("");
    setActiveSection("all");
  }

  return (
    <>
      <a className="skip-link" href="#briefing">
        Skip to briefing
      </a>

      <header className="site-header">
        <div className="shell header-inner">
          <a className="wordmark" href="#top" aria-label="AI Weekly Brief home">
            <span className="wordmark__signal" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              AI <em>Weekly</em> Brief
            </span>
          </a>

          <nav className="header-nav" aria-label="Briefing navigation">
            <a href="#briefing">Briefing</a>
            <a href="#review">Review</a>
            <a href="#workflow">Workflow</a>
          </nav>

          <span className="private-badge">
            <span aria-hidden="true" />
            Public briefing
          </span>
        </div>
      </header>

      <main id="top">
        <section className="hero shell" aria-labelledby="brief-title">
          <div className="hero-copy">
            <div className="issue-line">
              <span>{issue.issue}</span>
              <span aria-hidden="true">/</span>
              <span>{issue.label}</span>
            </div>

            <h1 id="brief-title">
              The signal
              <br />
              <em>beneath the noise.</em>
            </h1>

            <p className="hero-summary">{issue.summary}</p>

            <div className="hero-status">
              <span className="status-pill">{issue.status}</span>
              <span>{issue.period}</span>
            </div>
          </div>

          <aside id="review" className="review-card" aria-labelledby="review-title">
            <div className="review-card__header">
              <span className="kicker">Editorial review</span>
              <span className="decision-badge">{issue.review.decision}</span>
            </div>

            <h2 id="review-title">{issue.review.recommendation}</h2>

            <dl className="review-list">
              <div>
                <dt>Issue contents</dt>
                <dd>
                  {issue.review.itemsReviewed}/{issue.review.totalItems} reviewed
                </dd>
              </div>
              <div>
                <dt>Source health</dt>
                <dd>{issue.review.sourceHealth}</dd>
              </div>
              <div>
                <dt>Generated</dt>
                <dd>{issue.generatedAt}</dd>
              </div>
            </dl>

            <div
              className="review-progress"
              role="progressbar"
              aria-label="Editorial review progress"
              aria-valuemin={0}
              aria-valuemax={issue.review.totalItems}
              aria-valuenow={issue.review.itemsReviewed}
            >
              <span
                style={{
                  width: `${
                    (issue.review.itemsReviewed / issue.review.totalItems) * 100
                  }%`,
                }}
              />
            </div>

            <p className="review-card__note">{issue.review.note}</p>
            <a className="text-link" href="#workflow">
              See the release safeguards <span aria-hidden="true">↓</span>
            </a>
          </aside>
        </section>

        <section className="brief-stats" aria-label="Briefing summary">
          <div className="shell brief-stats__inner">
            <div>
              <span className="stat-value">{totalCount}</span>
              <span className="stat-label">briefing stories</span>
            </div>
            <div>
              <span className="stat-value">{issue.sections.length}</span>
              <span className="stat-label">editorial sections</span>
            </div>
            <div>
              <span className="stat-value">Friday</span>
              <span className="stat-label">planned refresh</span>
            </div>
            <div>
              <span className="stat-value">Draft first</span>
              <span className="stat-label">release safeguard</span>
            </div>
          </div>
        </section>

        <section id="briefing" className="briefing shell" aria-labelledby="briefing-title">
          <div className="briefing-heading">
            <div>
              <span className="kicker">Editorial queue</span>
              <h2 id="briefing-title">This issue, at a glance</h2>
            </div>
            <p>
              A short, ranked selection designed for useful decisions rather
              than comprehensive coverage.
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
                aria-label="Search stories"
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

            <div className="filter-group" role="group" aria-label="Filter by section">
              <button
                type="button"
                className="filter-button"
                data-filter="all"
                aria-pressed={activeSection === "all"}
                onClick={() => setActiveSection("all")}
              >
                All
                <span>{totalCount}</span>
              </button>
              {issue.sections.map((section) => (
                <button
                  type="button"
                  className="filter-button"
                  data-filter={section.id}
                  aria-pressed={activeSection === section.id}
                  onClick={() => setActiveSection(section.id)}
                  key={section.id}
                >
                  {section.shortTitle}
                  <span>{section.stories.length}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="results-summary" aria-live="polite">
            {isFiltered
              ? `${visibleCount} ${
                  visibleCount === 1 ? "story" : "stories"
                } shown`
              : `${totalCount} briefing stories`}
          </p>

          {visibleSections.length > 0 ? (
            <div className="sections">
              {visibleSections.map((section) => (
                <section
                  className="brief-section"
                  aria-labelledby={`${section.id}-title`}
                  key={section.id}
                >
                  <div className="section-heading">
                    <div>
                      <span className="section-index">
                        {String(
                          issue.sections.findIndex(
                            (item) => item.id === section.id,
                          ) + 1,
                        ).padStart(2, "0")}
                      </span>
                      <h2 id={`${section.id}-title`}>{section.title}</h2>
                    </div>
                    <p>{section.description}</p>
                  </div>

                  <div
                    className="story-grid"
                    data-single={section.stories.length === 1 ? "true" : "false"}
                  >
                    {section.stories.map((story) => (
                      <StoryCard story={story} key={story.id} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="empty-state" data-testid="empty-state">
              <span aria-hidden="true">0</span>
              <h2>No stories match this view</h2>
              <p>Try a different search or return to the complete briefing.</p>
              <button type="button" onClick={clearFilters}>
                Show all stories
              </button>
            </div>
          )}
        </section>

        <section id="workflow" className="workflow">
          <div className="shell">
            <div className="workflow-heading">
              <div>
                <span className="kicker">Operating rhythm</span>
                <h2>
                  Refresh often.
                  <br />
                  <em>Publish deliberately.</em>
                </h2>
              </div>
              <p>
                The current approved briefing is protected throughout the
                process. A refresh can fail safely without changing what readers
                see.
              </p>
            </div>

            <div className="workflow-grid">
              <article>
                <span className="workflow-number">01</span>
                <h3>Refresh</h3>
                <p>
                  Collect, normalize, deduplicate, and rank the agreed source set
                  every Friday or on demand.
                </p>
                <span className="workflow-detail">Creates a timestamped draft</span>
              </article>
              <article>
                <span className="workflow-number">02</span>
                <h3>Review</h3>
                <p>
                  Check ordering, evidence, source health, links, overlap, and
                  the executive-to-technical mix.
                </p>
                <span className="workflow-detail">Requires human judgement</span>
              </article>
              <article>
                <span className="workflow-number">03</span>
                <h3>Release</h3>
                <p>
                  Promote only an approved, validated draft. Preserve the
                  previous issue until promotion succeeds.
                </p>
                <span className="workflow-detail">Atomic approval gate</span>
              </article>
              <article>
                <span className="workflow-number">04</span>
                <h3>Retain</h3>
                <p>
                  Keep the current issue, the previous four published issues,
                  and recent drafts for 35 days.
                </p>
                <span className="workflow-detail">Cleanup starts as a preview</span>
              </article>
            </div>

            <div className="workflow-footer">
              <span>Australia / Melbourne</span>
              <span>Friday cadence</span>
              <span>On-demand uses the same workflow</span>
              <span>Current issue is never overwritten by refresh</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell">
          <span>AI Weekly Brief · public editorial briefing</span>
          <span>Collection and publishing remain deliberately separate</span>
        </div>
      </footer>
    </>
  );
}
