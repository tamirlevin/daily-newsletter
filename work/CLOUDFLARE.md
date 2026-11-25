# Cloudflare migration runbook

Target hostname: `https://brief.tamirlevin.dev`

This branch prepares a Cloudflare Worker + Static Assets + D1 deployment without removing the existing Sites build path. Do not cut over or enable email until data, secrets, fencing, and delivery state are verified.

## Build

```bash
npm run build:cloudflare
```

The Cloudflare build skips the Sites-only Vite plugin and Sites bundle-copy step. It still validates seeds, builds the client, builds SSR, and prerenders the reader. Social metadata is target-specific: the default Sites build uses the current Sites hostname; the Cloudflare build rewrites it to `brief.tamirlevin.dev`.

## Wrangler configuration

`wrangler.cloudflare.jsonc` expects:

- Worker name: `ai-weekly-brief`
- Static assets: `dist/client`, bound as `ASSETS`
- Worker-first routing only for `/api` and `/api/*`
- D1 binding: `DB`
- Custom domain: `brief.tamirlevin.dev`
- Public base URL: `https://brief.tamirlevin.dev`

The reader uses hash routes, so SPA fallback is disabled. Unknown non-API paths should return asset 404s; unknown API paths, including bare `/api`, must return JSON 404s.

Before deploying, replace `REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID` with the real D1 database ID. Confirm the Cloudflare account owns the `tamirlevin.dev` zone, check DNS conflicts, and verify TLS before attaching the custom domain.

Use `wrangler.cloudflare.predeploy.jsonc` for the initial route-free deployment. It has the same Worker/D1/assets settings but no custom-domain route. After the final restore is verified, deploy with `wrangler.cloudflare.jsonc` to attach `brief.tamirlevin.dev`.

## Publishing and single-recipient email

Set `INGEST_TOKEN` through Wrangler or the Cloudflare dashboard, not in source
control. It must match GitHub's `SITES_INGEST_TOKEN`. Leave staging email
unconfigured.

For production email, onboard the sender domain in Cloudflare Email Sending and
verify the recipient in Email Routing's **Destination Addresses**. Configure a
`send_email` binding named `EMAIL` restricted to that single destination via
`destination_address`. Keep that production config in the ignored
`work/.wrangler.cloudflare.email.json`, based on `wrangler.cloudflare.jsonc`.
Once the binding is configured, deploy from `work/` with
`npm run build:cloudflare` followed by
`npx wrangler deploy --config .wrangler.cloudflare.email.json`; the standard
email-disabled config would remove the binding. Set `EMAIL_FROM` to a bare
mailbox on the onboarded domain and `DAILY_EMAIL_TO` as a Worker secret.
No Resend key is needed for the native binding. The original Sites
configuration can still use Resend.

## Historical email cutoff

If historical reader data is imported without a verified delivery ledger, set:

```text
EMAIL_CUTOFF_REQUIRED=true
EMAIL_MIN_ISSUE_DATE=<first Melbourne issue date eligible for automatic email>
```

Set a real cutoff in the production deployment config for the first new
Melbourne issue approved for email, after the last issue Sites could have sent.
Native delivery requires a valid cutoff and rejects reader-only imports even
if the cutoff would allow them.

Cloudflare delivery atomically claims the accepted payload before calling the
provider. A second request never sends again. If the provider response or the
ledger write is uncertain, leave the claim in place and reconcile against
Cloudflare's delivery logs. Do not automatically clear or replay it. If
Cloudflare returned a message ID but recording it failed, the Worker logs the
run ID and message ID for reconciliation.

Keep `DAILY_EMAIL_ENABLED=false` while configuring the binding. To try just
one scheduled issue, set `DAILY_EMAIL_FIRST_ISSUE_DATE` to its Melbourne date.
The workflow checks the accepted run ID, so the exception expires with that
issue. Verify inbox receipt and the `sent` ledger row before enabling recurring
email, then remove the one-issue variable. Do not replay historical or
ambiguous deliveries.

## Data migration

Prefer a supported export of the Sites-managed D1 database, including both:

- `brief_runs`
- `email_deliveries`

Public history APIs are only a fallback for reader history. They do not expose the full delivery ledger, original payload hashes, or all update metadata.

Reproducible restore path:

1. Create a clean target D1 database.
2. Apply the repository migrations to the empty target.
3. Import data only for `brief_runs` and `email_deliveries`.
4. Compare source and target IDs, timestamps, payload hashes, delivery statuses, and provider message IDs, including ledger entries whose issues aged out of reader history.

If restoring a schema-inclusive dump instead, explicitly reconcile Wrangler's migration journal. Do not blindly run migrations over restored tables. Store dumps outside the repo and assets tree.

Do not replay historical public snapshots through `/api/ingest`; import them as stored rows or use a verified D1 dump.

`/api/health` does not query D1, and `/api/runs` currently masks D1 errors as `200` with an empty list. Require direct DB verification and both API feeds to match the snapshot before switching GitHub.

## Fresh-start with public reader snapshot

If full Sites D1 export is unavailable or unnecessary, save and import only the public reader history:

```bash
npm run export:public-history \
  https://ai-weekly-brief.tamir-levin.chatgpt.site \
  data/import/staging-public-history.json
npm run import:public-history -- \
  --file data/import/staging-public-history.json \
  --expect-daily 7 --expect-weekly 3
```

If full Sites D1 export is unavailable or unnecessary, import only the public reader history:

```bash
npm run import:public-history -- \
  --daily-file /path/to/daily.json \
  --weekly-file /path/to/weekly.json \
  --output data/import/public-history.sql
```

Or fetch the current public feeds directly:

```bash
npm run import:public-history -- --source https://ai-weekly-brief.tamir-levin.chatgpt.site
```

Apply the generated SQL to a clean target only after migrations:

```bash
npm run import:public-history -- \
  --apply \
  --database ai-weekly-brief \
  --config wrangler.cloudflare.jsonc \
  --daily-file /path/to/daily.json \
  --weekly-file /path/to/weekly.json
```

This imports `brief_runs` only. It uses `legacy:<runId>` payload hashes and does not import `email_deliveries`. Historical email must remain blocked by `EMAIL_MIN_ISSUE_DATE`. For the final cutover, take the public snapshot after Sites writes are fenced, then import that snapshot into the clean production target.

## Staging smoke test

Use the separate staging configuration and database. Do not attach `brief.tamirlevin.dev` or set Resend credentials for staging.

```bash
./node_modules/.bin/wrangler d1 migrations apply ai-weekly-brief-staging \
  --config wrangler.staging.jsonc --remote
npm run export:public-history \
  https://ai-weekly-brief.tamir-levin.chatgpt.site \
  data/import/staging-public-history.json
npm run import:public-history -- \
  --file data/import/staging-public-history.json \
  --expect-daily 7 --expect-weekly 3 --apply
./node_modules/.bin/wrangler secret put INGEST_TOKEN \
  --config wrangler.staging.jsonc
npm run deploy:cloudflare:staging
```

Verified staging URL: `https://ai-weekly-brief-staging.tamirlevin.workers.dev`

Smoke-test root HTML and target-specific metadata, real JS/CSS, asset 404s, JSON 404s for `/api` and unknown `/api/*`, unauthenticated ingest `401`, authenticated test publication, both cadence feeds, `emailConfigured: false`, and authenticated delivery `503`. Test publications should use isolated fixtures and leave the public reader snapshot intact.

## Cutover sequence

1. Verify the current Sites endpoint is healthy after the GitHub URL fix.
2. Rehearse the complete restore on staging, including saved-file import, row/feed comparison, routing, and authenticated publication.
3. Create a clean production D1 database and apply migrations. Deploy with `npm run deploy:cloudflare:predeploy` and email credentials unset, but do not switch GitHub or attach the custom domain yet.
4. Pause both GitHub workflows and drain queued/in-flight jobs.
5. Fence Sites writes: disable or revoke authenticated ingest and email writes, then verify both endpoints are blocked.
6. Capture a timestamped final public snapshot from Sites after fencing. Validate expected run counts and IDs.
7. Import that final snapshot into the clean production D1. Verify row IDs, payloads, and both served feeds against the snapshot. Do not load a rehearsal snapshot into the final target.
8. Attach the domain with `npm run deploy:cloudflare`, then verify `brief.tamirlevin.dev`, TLS, root HTML, real assets, API routing, and both history feeds.
9. Set GitHub repository variable `DAILY_EMAIL_ENABLED=false`. Leave manual `deliver_email` unchecked and all Cloudflare email credentials unset.
10. Update GitHub `SITES_INGEST_URL` to `https://brief.tamirlevin.dev/api/ingest` and update the token only if it changed.
11. Run one controlled fresh issue. Verify it persists and is readable after ingest, and verify recent-URL exclusion uses the migrated history.
12. Resume schedules with email disabled. Keep only one active publisher.
13. Enable live email separately using the single-recipient setup and verification above.

## Rollback

Before the first new Cloudflare write, restoring the Sites endpoint and matching token is straightforward if Sites remains available.

After new Cloudflare writes, pause and drain again, fence Cloudflare writes, then reconcile both new issue rows and delivery rows before reopening Sites. Changing the GitHub URL alone is not a rollback. Prefer fixing forward.

Keep the old reader usable or redirect reader GETs only, since existing email links still point there. Confirm Sites billing cancellation separately; switching GitHub or DNS does not cancel Sites.
