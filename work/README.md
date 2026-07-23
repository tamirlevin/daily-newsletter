# AI Weekly Brief

The application combines a scheduled public-source collector with a public
Sites reader. There is no editorial approval application: a complete,
source-healthy run is published automatically, and an invalid run leaves the
last good briefing untouched.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The local site uses an embedded real collector run until its local database has
published data.

## Validate

```bash
npm test
```

This checks source parsing, sponsor filtering, URL cleanup, cross-source
deduplication, source guardrails, the 70/20/10 allocation, publication gates,
the database migration, and the rendered reader.

## Collect and inspect a run

```bash
npm run collect
npm run summarize:draft
```

The collector reads:

- TLDR AI and AlphaSignal for broad discovery.
- Hacker News for community attention.
- Hugging Face Daily Papers for research direction.
- OpenAI, Anthropic, and Google / Gemini feeds for primary evidence.

It writes timestamped JSON to `data/drafts/` and source diagnostics to
`data/source-health/`. Generated runs are ignored by Git and retained briefly
as GitHub Actions artifacts.

## Automatic publication

The Friday GitHub Actions job:

1. tests the collectors;
2. collects and ranks exactly ten stories;
3. checks the 7 executive / 2 technical / 1 research mix;
4. sends the run to the authenticated Sites endpoint; and
5. keeps a diagnostic artifact for 14 days.

Sites rejects a run unless it has ten unique HTTPS links, sufficient healthy
sources, the exact 7/2/1 mix, and no selected story flagged for missing evidence
or promotional language. Accepted writes are idempotent by collector run ID.
The database retains exactly three successful runs.

Hosted values are managed outside version control:

- `SITES_INGEST_URL` is the deployed site URL ending in `/api/ingest`.
- `SITES_INGEST_TOKEN` is the shared publication secret held by both Sites and
  GitHub Actions.

## Source policy

Discovery value and evidence authority are scored separately. Newsletters can
surface a story; an official announcement, original paper, repository, or
specific primary link strengthens its evidence. Official lab feeds are ranked
down as discovery because they are orchestrated communications rather than
independent coverage.

Direct X ingestion is deliberately absent to avoid an API or personal-account
dependency. X links already present in newsletters or other configured sources
can still be selected.

## Storage

Sites supplies the `DB` binding declared in `.openai/hosting.json`. The
`brief_runs` table stores one JSON payload per successful collector run.
Migrations are generated with:

```bash
npm run db:generate
```
