# AI Weekly Brief — repository memory

This file is the starting point for future Codex sessions. Read it before
changing the project. It records the product decisions, architecture,
operating model, and safe change paths that are easy to miss from individual
source files.

Update this file in the same change whenever a durable product decision,
deployment path, secret name, invariant, or major file location changes. Do not
turn it into a running diary; keep transient status in GitHub and the live APIs.

## Product in one paragraph

AI Weekly Brief is a public, automatically published weekly briefing. GitHub
Actions collects and ranks public AI news; ChatGPT Sites validates, stores, and
serves the accepted run. There is deliberately no editor, approval button,
promote flow, or separate X collector. The reader has three views: **Latest**,
**History**, and **How it works**.

- Live reader: <https://ai-weekly-brief.tamirlevin300024.chatgpt.site/>
- Repository: <https://github.com/tamirlevin/daily-newsletter>
- Application root: `work/`
- Sites project ID: `appgprj_6a6207923a908191878805ae6f8913c1`

## Decisions that must remain true unless the user changes them

1. Publication is automatic. A valid collector run goes directly to Sites.
2. The reader is public. Administrative or editorial controls do not belong in
   the public UI.
3. Every published briefing contains exactly ten stories:
   seven executive, two technical, and one research.
4. Retain exactly three **successful** runs: current plus the previous two.
   Failed attempts are diagnostics, not history entries.
5. A failed, partial, unhealthy, promotional, or insufficiently evidenced run
   must not replace the last good briefing.
6. TLDR AI and AlphaSignal provide broad discovery; Hacker News provides
   community signal; Hugging Face Daily Papers provides research discovery;
   OpenAI, Anthropic, and Google/Gemini are primarily evidence sources.
7. Official lab feeds are down-weighted for discovery because they are
   orchestrated communications, while their primary-source evidence remains
   valuable.
8. Do not add direct X ingestion or a dependency on the user's X account. A
   specific X link discovered through an existing public source may still be
   selected.
9. Preserve the current editorial design language unless the user explicitly
   requests a redesign. The How it works view should continue to explain
   repository durability and session control, with links to the repository and
   this boot file.
10. GitHub Pages is no longer the active deployment architecture. Do not
    restore a Pages deployment workflow unless the user changes that decision.

## Architecture

```text
GitHub Actions (.github/workflows/collect.yml)
  -> Node collectors (work/lib/collector/)
  -> deduplicate, enrich, score, and select 10 stories
  -> timestamped draft + source-health diagnostic artifact
  -> work/scripts/publish-latest.mjs
  -> authenticated POST /api/ingest
  -> Sites Worker validation (work/worker/)
  -> D1 brief_runs table
  -> GET /api/runs
  -> React reader (work/app/)
```

GitHub is the runner. Sites is the public application and data store. GitHub
Actions publishes data; it does not deploy the Site's application code.

### Runtime endpoints

- `GET /api/health` — deployment health.
- `GET /api/runs` — newest three successful runs, newest first.
- `POST /api/ingest` — protected publication endpoint using a bearer token.

The Worker validates before writing to D1. Writes are idempotent by
`generatedAt`, which is also the run ID. After an accepted write, it deletes
anything older than the newest three runs.

The React reader fetches `/api/runs`. If the live store is empty or unavailable,
it keeps rendering `work/data/seed-run.json`. Therefore an empty local
`/api/runs` response is expected when the local D1 database has not been seeded.
The embedded seed is a fallback, not the production source of truth.

## Important files

| Area | File or directory |
| --- | --- |
| Scheduled runner | `.github/workflows/collect.yml` |
| Product/operations overview | `README.md`, `work/README.md` |
| Source list, weights, mix | `work/config/editorial.json` |
| Source parsers | `work/lib/collector/` |
| Collection orchestration | `work/lib/collector/pipeline.mjs` |
| Ranking and lane rules | `work/lib/collector/editorial.mjs` |
| Collector command | `work/scripts/collect.mjs` |
| GitHub-to-Sites bridge | `work/scripts/publish-latest.mjs` |
| Publication gate | `work/worker/publication.mjs` |
| HTTP API and retention | `work/worker/index.ts` |
| D1 schema and migration | `work/db/schema.ts`, `work/drizzle/` |
| Reader behavior | `work/app/briefing-app.tsx` |
| Visual system | `work/app/globals.css` |
| Sites identity/bindings | `work/.openai/hosting.json` |
| Local/production build | `work/vite.config.ts`, `work/build/` |
| Real fallback run | `work/data/seed-run.json` |
| Test suite | `work/tests/` |

## First five minutes in a new session

1. Run `git status --short --branch`. Preserve unrelated user changes.
2. Read this file, then `README.md` and `work/README.md`.
3. Work from `work/` for application commands.
4. Check `work/package.json` before assuming a command or Node version.
5. For a production issue, check the live health and runs endpoints plus the
   latest `Collect weekly candidates` GitHub Actions run before changing code.

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
publication gates, D1 retention behavior, static rendering, and the Worker API.
Run `npm run build` separately only when a standalone production artifact is
needed.

Commands that contact real sources or production:

```bash
cd work
npm run collect
npm run summarize:draft
npm run publish:latest
```

- `npm run collect` writes ignored files under `work/data/drafts/` and
  `work/data/source-health/`.
- `npm run publish:latest` writes to the configured Site. It requires
  `SITES_INGEST_URL` and `SITES_INGEST_TOKEN`; do not run it against production
  without authorization.
- GitHub Actions retains generated drafts and health reports as diagnostic
  artifacts for 14 days. They are not committed.

## Deployment and secrets

### GitHub

The workflow runs at `0 22 * * 4`: Friday morning in Melbourne
(08:00 AEST / 09:00 AEDT), plus manual `workflow_dispatch`.

Repository Actions secrets:

- `SITES_INGEST_URL` — the live URL ending in `/api/ingest`.
- `SITES_INGEST_TOKEN` — the shared publication token.

Collector, ranking, or workflow changes become active after they reach `main`.
A useful end-to-end verification is a manual dispatch of
`Collect weekly candidates`, followed by checking that its publication step
passes and `/api/runs` contains the new run.

### Sites

The Site is identified by `work/.openai/hosting.json` and uses:

- D1 binding `DB`.
- Hosted secret `INGEST_TOKEN`, matching GitHub's token.
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
4. Keep the 7/2/1 publication invariant in sync with
   `work/worker/publication.mjs`.

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
3. Keep Latest focused on cards and outbound links; keep system explanation
   under How it works.
4. Update render/API tests for behavior changes.
5. Keep the embedded seed valid so local and outage fallback rendering works.
6. Redeploy the existing Site after merging the change.

### Change publication or storage

1. Treat `work/worker/publication.mjs` as the trust boundary.
2. Change `work/worker/index.ts` and the Worker API tests together.
3. For schema changes, update `work/db/schema.ts`, run
   `npm run db:generate`, and inspect the generated migration.
4. Preserve idempotency, authenticated ingestion, and last-good-run behavior.
5. Redeploy the existing Site and verify both `/api/health` and `/api/runs`.

### Change the schedule

Edit `.github/workflows/collect.yml`. GitHub cron is UTC; document both AEST and
AEDT behavior so a daylight-saving shift is not mistaken for a bug.

## Definition of done

A change is not complete until:

- the smallest relevant tests and the full `npm test` suite pass;
- `npm run lint` and `git diff --check` pass;
- no secret or generated collector output is staged;
- source, mix, retention, and last-good-run invariants still hold;
- Site code changes are deployed to the existing Site;
- production-path changes are checked with a manual Actions run or an
  equivalent authenticated publication test; and
- the live reader and APIs remain healthy.

## Historical checkpoint

On 2026-07-23, PR #2 was merged as commit `32d47fd`, live deployment health
passed, and GitHub Actions run `30008520058` completed collection and automatic
publication successfully. This is a reference point, not current-state truth;
future sessions should query GitHub and the live endpoints.
