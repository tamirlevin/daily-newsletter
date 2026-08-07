# AI Daily + Weekly Brief — repository memory

This file is the starting point for future Codex sessions. Read it before
changing the project. It records the product decisions, architecture,
operating model, and safe change paths that are easy to miss from individual
source files.

Update this file in the same change whenever a durable product decision,
deployment path, secret name, invariant, or major file location changes. Do not
turn it into a running diary; keep transient status in GitHub and the live APIs.

## Product in one paragraph

AI Daily + Weekly Brief is a public, automatically published briefing with two
cadences. GitHub Actions uses shared collectors to rank public AI news; ChatGPT
Sites validates, stores, and serves accepted runs. An accepted Daily run also
triggers one email to the configured recipient. There is deliberately no
editor, approval button, promote flow, registration system, or separate X
collector. The reader has **Daily**, **Weekly**, cadence-specific **History**,
and **How it works** views.

- Live reader: <https://ai-weekly-brief.tamirlevin300024.chatgpt.site/>
- Repository: <https://github.com/tamirlevin/daily-newsletter>
- Application root: `work/`
- Sites project ID: `appgprj_6a6207923a908191878805ae6f8913c1`

## Decisions that must remain true unless the user changes them

1. Publication is automatic. A valid collector run goes directly to Sites.
2. The reader is public. Administrative or editorial controls do not belong in
   the public UI.
3. Every Daily briefing contains exactly five stories: three executive, one
   technical, and one builder. Every Weekly briefing contains exactly ten:
   seven executive, two technical, and one builder. Builder is the practical
   adoption lane for useful tools, protocols, platforms, and workflows;
   technical is reserved for architecture, implementation, and performance.
4. Retain exactly seven successful Daily runs and three successful Weekly runs.
   Failed attempts are diagnostics, not history entries.
5. A failed, partial, unhealthy, promotional, or insufficiently evidenced run
   must not replace the last good briefing.
6. TLDR AI and AlphaSignal provide broad discovery; InfoQ provides independent
   industry reporting; Simon Willison and Hacker News provide practitioner and
   community signal. Cloudflare Agents and the official Model Context Protocol
   blog provide focused builder evidence. OpenAI, Anthropic, and Google/Gemini
   are primarily evidence sources. Hugging Face Daily Papers is not an active
   source because academic papers no longer receive a reserved slot.
7. Primary feeds do not earn independent-discovery credit. Coverage led by a
   recognised model lab is capped at two stories in Daily and three in Weekly,
   with at most one story per lab, even when a third party discovered or
   reported it. These are hard collector and publication limits: an otherwise
   valid run fails rather than relaxing them.
8. Do not add direct X ingestion or a dependency on the user's X account. A
   specific X link discovered through an existing public source may still be
   selected.
9. Preserve the compact 75/25 editorial design unless the user explicitly
   requests another redesign: flat numbered rows, thin rules, sans-serif
   headings, no Daily discovery controls, and compact Weekly and History
   search. The How it works view should continue to explain repository
   durability and session control, with links to the repository and this boot
   file.
10. GitHub Pages is no longer the active deployment architecture. Do not
    restore a Pages deployment workflow unless the user changes that decision.
11. Daily email has one configured recipient and no public registration flow.
    It may be requested only after the exact Daily run has been accepted and
    stored by Sites. Weekly cannot use the email endpoint. The current
    single-recipient setup uses Resend's `onboarding@resend.dev` sender because
    the recipient is the email address attached to the Resend account.
12. Run identity is `{cadence}:{Melbourne issue date}`. Re-running the same
    issue must not create another history record or another email.
13. Daily uses a three-day discovery window so a varied five-story issue remains
    viable on weekends. Before collection, the workflow loads retained Daily
    URLs from Sites and excludes them so the wider window does not repeat recent
    stories.
14. Summaries are best-effort enrichment, not a publication gate. GitHub
    Actions attempts an independently written 35–75 word `briefSummary` for
    each selected story with GitHub Models and its automatic `GITHUB_TOKEN`.
    A valid summary uses `summaryStatus: "generated"` and remains subject to
    overlap, promotional-language, markup, and length checks. If generation or
    validation fails, the already-valid selected story uses
    `summaryStatus: "unavailable"`, omits `briefSummary`, and publishes as a
    source-linked headline with metadata. `not-generated` is never publishable.
    Schema-version-3 payloads support generated and explicitly unavailable
    summaries; stored version-2 runs remain readable as historical data.

## Architecture

```text
GitHub Actions (.github/workflows/collect-daily.yml and collect.yml)
  -> Node collectors (work/lib/collector/)
  -> cadence profile (Daily 5 or Weekly 10)
  -> deduplicate, enrich, score, and select
  -> best-effort GitHub Models evidence-grounded brief summaries
  -> timestamped draft + source-health diagnostic artifact
  -> work/scripts/publish-latest.mjs
  -> authenticated POST /api/ingest
  -> Sites Worker validation (work/worker/)
  -> D1 brief_runs table, retained independently by cadence
  -> Daily only: POST /api/email-deliveries -> Resend
  -> GET /api/runs?cadence=daily|weekly
  -> React reader (work/app/)
```

GitHub is the runner. Sites is the public application and data store. GitHub
Actions publishes data; it does not deploy the Site's application code.

### Runtime endpoints

- `GET /api/health` — deployment health.
- `GET /api/runs?cadence=daily|weekly` — successful history for one cadence.
- `GET /api/runs/:runId` — one accepted issue.
- `POST /api/ingest` — protected publication endpoint using a bearer token.
- `POST /api/email-deliveries` — protected Daily-only delivery request.
- `GET /api/email-deliveries/:runId` — protected delivery status.

The Worker validates before writing to D1. Writes are idempotent by stable run
ID, and retention deletion always filters by cadence. A changed Daily payload
is frozen once its delivery is sending or sent.

The React reader fetches both cadence histories. If the live store is empty or
unavailable, it keeps rendering `work/data/seed-daily-run.json` and
`work/data/seed-run.json`. Embedded seeds are fallbacks, not the production
source of truth.

## Important files

| Area | File or directory |
| --- | --- |
| Scheduled runners | `.github/workflows/collect-daily.yml`, `.github/workflows/collect.yml` |
| Product/operations overview | `README.md`, `work/README.md` |
| Source list, weights, mix | `work/config/editorial.json` |
| Cadence invariants | `work/lib/briefing-profiles.mjs` |
| Model-lab identification | `work/lib/model-labs.mjs` |
| Source parsers | `work/lib/collector/` |
| Collection orchestration | `work/lib/collector/pipeline.mjs` |
| Ranking and lane rules | `work/lib/collector/editorial.mjs` |
| Summary generation and validation | `work/lib/brief-summary.mjs` |
| Collector command | `work/scripts/collect.mjs` |
| GitHub-to-Sites bridge | `work/scripts/publish-latest.mjs` |
| Daily delivery request | `work/scripts/request-daily-email.mjs` |
| Recent Daily URL exclusion | `work/scripts/fetch-recent-urls.mjs` |
| Publication gate | `work/worker/publication.mjs` |
| Email rendering | `work/worker/email.mjs` |
| HTTP API and retention | `work/worker/index.ts` |
| D1 schema and migration | `work/db/schema.ts`, `work/drizzle/` |
| Reader behavior | `work/app/briefing-app.tsx` |
| Visual system | `work/app/globals.css` |
| Sites identity/bindings | `work/.openai/hosting.json` |
| Local/production build | `work/vite.config.ts`, `work/build/` |
| Real fallback runs | `work/data/seed-daily-run.json`, `work/data/seed-run.json` |
| Test suite | `work/tests/` |

## First five minutes in a new session

1. Run `git status --short --branch`. Preserve unrelated user changes.
2. Read this file, then `README.md` and `work/README.md`.
3. Work from `work/` for application commands.
4. Check `work/package.json` before assuming a command or Node version.
5. For a production issue, check the live health, both cadence APIs, delivery
   status when relevant, and the latest matching GitHub Actions run.

Do not expose, rotate, or copy secret values into source files, chat prompts,
logs, or documentation.

## Local commands

Node.js 22.13 or newer is required.

```bash
cd work
npm ci
npm run dev
```

The normal verification sequence is:

```bash
cd work
npm test
npm run lint
git diff --check
```

`npm test` already builds the application and covers collectors, ranking,
cadence publication gates, separate D1 retention, email idempotency, static
rendering, and the Worker API. Run `npm run build` separately only when a
standalone production artifact is needed.

Commands that contact real sources or production:

```bash
cd work
npm run collect -- --cadence weekly
npm run collect -- --cadence daily
npm run summarize:draft -- --cadence weekly
npm run publish:latest -- --cadence weekly
```

- `npm run collect` writes ignored files under cadence-specific draft and
  source-health directories. Scheduled workflows attempt public summaries
  using the job's automatic GitHub token. A failed or unavailable summary
  becomes a link-only story; it does not bypass any source, ranking, mix, or
  evidence gate.
- `npm run publish:latest` writes to the configured Site. It requires
  `SITES_INGEST_URL` and `SITES_INGEST_TOKEN`; do not run it against production
  without authorization.
- GitHub Actions retains generated drafts and health reports as diagnostic
  artifacts for 14 days. They are not committed.

## Deployment and secrets

### GitHub

The Daily workflow runs at `0 22 * * *`; Weekly runs at `0 22 * * 4`.
Both are 08:00 AEST / 09:00 AEDT in Melbourne and support manual
`workflow_dispatch`. Both grant the job-scoped `GITHUB_TOKEN` read-only access
to GitHub Models for summary generation; this does not require a user-managed
secret.

Repository Actions secrets:

- `SITES_INGEST_URL` — the live URL ending in `/api/ingest`.
- `SITES_INGEST_TOKEN` — the shared publication token.

Collector, ranking, or workflow changes become active after they reach `main`.
A useful end-to-end verification is a manual dispatch of
the relevant Daily or Weekly workflow, followed by checking that publication
passes, the cadence API contains the run, and Daily delivery is confirmed.

### Sites

The Site is identified by `work/.openai/hosting.json` and uses:

- D1 binding `DB`.
- Hosted secret `INGEST_TOKEN`, matching GitHub's token.
- Hosted secret `RESEND_API_KEY`.
- Hosted values `EMAIL_FROM`, `DAILY_EMAIL_TO`, and `PUBLIC_BASE_URL`.
  `EMAIL_FROM` is currently `AI Brief <onboarding@resend.dev>`; if the recipient
  later changes to an address outside the Resend account, verify a sender domain
  first.
- Public sharing at the existing `chatgpt.site` URL.

Use the Sites build/hosting workflow with `work/` as the project root. Deploy
back to the existing project ID; do not create a replacement Site. Application,
Worker, migration, or metadata changes require a Sites redeploy. A hosted
secret change also requires redeployment before the Worker sees it.

Never put secret values in `.openai/hosting.json`; that manifest is committed.

## Safe change recipes

### Change ranking, mix, or source weighting

1. Start in `work/config/editorial.json`.
2. Update `work/lib/collector/editorial.mjs` only when configuration cannot
   express the rule.
3. Add or update focused cases in `work/tests/collectors/editorial.test.mjs`.
4. Keep both 3/1/1 and 7/2/1 executive/technical/builder invariants in sync across configuration,
   `work/lib/briefing-profiles.mjs`, and `work/worker/publication.mjs`.

### Add or repair a source

1. Add or update its config entry.
2. Add a parser module under `work/lib/collector/`.
3. Register it in the pipeline.
4. Add small local fixtures and parser tests; do not make tests depend on live
   websites.
5. Assign discovery and evidence roles explicitly.
6. Run the full test suite, then a real collection to inspect source health.

### Change the reader

1. Behavior and structure live in `work/app/briefing-app.tsx`.
2. Styling lives in `work/app/globals.css`.
3. Keep Daily and Weekly in a compact single-column flow with flat numbered
   rows and source-linked headlines; keep system explanation under How it
   works.
4. Update render/API tests for behavior changes.
5. Keep the embedded seed valid so local and outage fallback rendering works.
6. Keep Daily free of search and filters. Weekly retains one compact search and
   category-filter row; each cadence History retains its own search.
7. Keep sans-serif headings modest in size so hierarchy does not create
   unnecessary scrolling, while allowing older stored runs without summaries
   to degrade gracefully.
8. Redeploy the existing Site after merging the change.

### Change publication or storage

1. Treat `work/worker/publication.mjs` as the trust boundary.
2. Change `work/worker/index.ts` and the Worker API tests together.
3. For schema changes, update `work/db/schema.ts`, run
   `npm run db:generate`, and inspect the generated migration.
4. Preserve stable cadence/date IDs, separate retention, authenticated
   ingestion, delivery idempotency, and last-good-run behavior.
5. Redeploy the existing Site and verify `/api/health`, both cadence APIs, and
   the protected delivery status when email changed.

### Change the schedule

Edit `.github/workflows/collect-daily.yml` or `.github/workflows/collect.yml`.
GitHub cron is UTC; document both AEST and AEDT behavior so a daylight-saving
shift is not mistaken for a bug.

## Definition of done

A change is not complete until:

- the smallest relevant tests and the full `npm test` suite pass;
- `npm run lint` and `git diff --check` pass;
- no secret or generated collector output is staged;
- source, mix, retention, and last-good-run invariants still hold;
- no email is possible before Daily acceptance, on Weekly, or twice for one
  delivery key;
- Site code changes are deployed to the existing Site;
- production-path changes are checked with a manual Actions run or an
  equivalent authenticated publication test; and
- the live reader and APIs remain healthy.

## Historical checkpoint

On 2026-07-23, PR #2 was merged as commit `32d47fd`, live deployment health
passed, and GitHub Actions run `30008520058` completed collection and automatic
publication successfully. This is a reference point, not current-state truth;
future sessions should query GitHub and the live endpoints.
