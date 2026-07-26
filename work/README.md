# AI Daily + Weekly Brief

The application combines a scheduled public-source collector with a public
Sites reader. There is no editorial approval application: a complete,
source-healthy run is published automatically, and an invalid run leaves the
last good briefing untouched.

Daily and Weekly use the same source collectors, evidence policy, ranking
system, and reader design. Their publication profiles are separate:

- Daily: a three-day discovery window, excluding links already used in retained
  Daily history; five stories in a 3 executive / 1 technical / 1 research mix;
  seven successful runs retained.
- Weekly: ten stories in the existing 7 / 2 / 1 mix, with three successful
  runs retained.

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
deduplication, source guardrails, both cadence allocations, publication and
email gates, database behaviour, and the rendered reader.

## Collect and inspect a run

```bash
npm run collect
npm run collect -- --cadence daily
npm run summarize:draft -- --cadence weekly
```

The collector reads:

- TLDR AI and AlphaSignal for broad discovery.
- Hacker News for community attention.
- Hugging Face Daily Papers for research direction.
- OpenAI, Anthropic, and Google / Gemini feeds for primary evidence.

It writes timestamped JSON under cadence-specific `data/drafts/` and
`data/source-health/` directories. Generated runs are ignored by Git and
retained briefly as GitHub Actions artifacts.

## Automatic publication and Daily email

Each cadence has its own GitHub Actions scheduler. Both:

1. tests the collectors;
2. collects and ranks the cadence-specific story count;
3. generates a 35–75 word evidence-grounded summary for every selected story
   with GitHub Models and the job's automatic `GITHUB_TOKEN`;
4. checks the cadence-specific editorial mix and summary safety;
5. sends the run to the authenticated Sites endpoint; and
6. keeps a diagnostic artifact for 14 days.

Sites rejects a run unless it has the required unique HTTPS links, sufficient
healthy sources, the exact cadence mix, and no selected story flagged for
missing evidence or promotional language. It also rejects summaries that are
missing, ungenerated, outside 35–75 words, marked up, or promotional. Before
publication, the generator also rejects summaries that repeat a long source
passage. A stable run ID combines cadence and Melbourne issue date, so retrying
the same issue cannot create another history entry.

GitHub-hosted runners provide the summary token automatically through
`GITHUB_TOKEN` with `models: read`. No separate model API key or account setup
is required. A local collection without that token is diagnostic only and
cannot be published.

Only after Sites accepts and stores a Daily run does the workflow request email
delivery. Sites keeps the permanent delivery ledger and Resend receives the
same deterministic idempotency key on every retry. Weekly runs cannot use the
email endpoint.

Hosted values are managed outside version control:

- `SITES_INGEST_URL` is the deployed site URL ending in `/api/ingest`.
- `SITES_INGEST_TOKEN` is the shared publication secret held by both Sites and
  GitHub Actions.

Sites also holds these runtime values:

- `RESEND_API_KEY` — secret provider credential.
- `EMAIL_FROM` — `AI Brief <onboarding@resend.dev>` while the only recipient is
  the email address attached to the Resend account. A verified sender domain is
  needed only if delivery later expands to another address.
- `DAILY_EMAIL_TO` — the single configured recipient.
- `PUBLIC_BASE_URL` — the live reader origin used in email links.

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
`brief_runs` table stores one accepted JSON payload per cadence and issue date.
The `email_deliveries` table stores delivery metadata without exposing the
recipient in the public repository. Migrations are generated with:

```bash
npm run db:generate
```
