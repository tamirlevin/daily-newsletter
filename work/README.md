# AI Weekly Brief

A public, statically hosted reader with a separate editorial collection
pipeline for a concise weekly AI briefing.

The current reader issue is deliberately labelled as demonstration content.
The review pipeline connects to public sources, but no collected draft is
promoted automatically and no production summaries are generated without
editorial review.

Public reader: <https://tamirlevin.github.io/daily-newsletter/>

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local address printed by the development server.

## Validate

```bash
npm test
```

The validation suite checks all source parsers, sponsor and promotional
filtering, URL cleanup, cross-source deduplication, discovery-versus-evidence
scoring, source guardrails, the 70/20/10 editorial allocation, the source-health
report, approved-issue schema, and the statically rendered reader.

## Collect a review draft

```bash
npm run collect
```

The command reads public metadata from:

- TLDR AI's stable RSS feed and dated issue pages.
- AlphaSignal's crawler-allowed full news sitemap and selected public article
  pages.
- Hacker News search metadata for dated, engaged AI discussions.
- OpenAI's official news RSS feed.
- Anthropic's dated public newsroom listing and selected article pages.
- Google's official RSS feed, filtered to Gemini and Google AI/DeepMind items.
- Hugging Face Daily Papers, with both submission-date and original-paper
  recency checks.

It writes a timestamped candidate draft to `data/drafts/` and a separate health
report to `data/source-health/`. It never replaces `data/issue.json` and does
not publish anything.

Useful local overrides:

```bash
npm run collect -- --as-of 2026-07-23T08:00:00+10:00
npm run collect -- --lookback-days 7 --max-items 10
```

The collector removes sponsors and house promotion, strips common tracking
parameters, resolves TLDR tracking links, prefers specific underlying evidence
links from AlphaSignal articles, and merges duplicates across all sources.
Hacker News launch posts and sole-source community items are capped so they
cannot dominate the review queue. Source prose is used only in memory for
deterministic classification and is removed from the generated draft.

To print a readable table for the newest draft:

```bash
npm run summarize:draft
```

## Editorial policy

The review queue targets:

- 70% executive-ready developments with material strategic, commercial,
  operating, policy, security, or governance consequences.
- 20% technical developments that a delivery team could evaluate or apply.
- 10% research selected for consequence rather than publication volume.

The ranking model keeps two source properties separate:

- **Discovery weight** measures how useful a source is for finding consequential
  stories. TLDR AI and AlphaSignal are broad discovery signals; Hacker News is a
  community-attention signal; Hugging Face is a research-discovery signal.
- **Evidence authority** measures support for the factual brief. Official lab
  pages and underlying papers are primary evidence, but they do not count as
  independent discovery corroboration.

Official feeds receive a lower discovery weight because their coverage is
orchestrated PR. A vendor normally receives no more than one item discovered
only through its own feed, while important stories found through independent
channels remain eligible. Published briefing copy must be written independently
and should cite the underlying announcement, paper, repository, or specific X
post where available.

## Content

`data/issue.json` is the single source of truth for the public issue. The
checked-in version currently contains demonstration content across four
sections:

1. The Week in AI
2. Models & Capabilities
3. For Builders
4. Research Watch

The reader supports case-insensitive search, section filters, combined
search-and-filter behavior, a zero-results state, and responsive layouts.
`public/og.png` carries the same visual system into link-preview metadata.

## Intended operating workflow

1. **Refresh:** collect, normalize, deduplicate, and rank the agreed source set.
   Always create a timestamped draft.
2. **Review:** check evidence, ordering, source health, links, overlap, and the
   executive/builder/research mix.
3. **Release:** promote only an explicitly approved, validated draft. Keep the
   current issue intact until promotion succeeds.
4. **Retain:** preserve the current issue, the previous four published issues,
   and drafts from the last 35 days.

Friday and on-demand refreshes use the same collection command.

## GitHub operation

- `Publish public briefing` validates and deploys `data/issue.json` after a
  change reaches `main`.
- `Collect weekly candidates` runs at 08:00 AEST / 09:00 AEDT each Friday and
  can also be started from the repository's **Actions** tab.
- Each collection run shows a readable candidate table in its summary and keeps
  the exact JSON draft and health report as a downloadable artifact for 35
  days.
- Collection never modifies `data/issue.json`; public content changes only
  through a reviewed repository change.

## Security and current scope

- Do not store API keys, raw source extracts, private issue history, or
  credentials in version control.
- Direct X ingestion remains intentionally unimplemented. Specific X links
  discovered through configured sources are retained as candidates.
- Model-assisted summarisation remains intentionally unimplemented. Publishing
  requires human review and independently written copy.
- The public reader is a static export. It has no server process, database,
  sign-in layer, or runtime secret.
