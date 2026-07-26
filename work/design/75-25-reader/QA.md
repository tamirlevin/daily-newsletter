# 75/25 reader redesign QA criteria

Status: approved for local implementation. Release remains a separate,
unapproved gate.

## How to use this matrix

- **Automated** means a deterministic test or repository check should enforce
  the criterion.
- **Visual/manual** means a reviewer must inspect the rendered result or
  interaction; automation may assist but is not sufficient.
- **Both** means neither form of evidence may be omitted.

Reference viewports:

- desktop: 1440 × 900;
- compact desktop: 1280 × 800;
- normal phone: 390 × 844;
- narrow phone: 320 × 568.

Use the same realistic issue content when comparing layouts. Capture the
current reader's Daily page height at 1440 × 900 before implementation; the
redesigned Daily page must be at least 20% shorter with no content removed.

## Gate 1 — local mockup review

This gate evaluates design direction only. A mockup passing it must not be
treated as production-ready.

| ID | View or concern | Acceptance criterion | Verification |
| --- | --- | --- | --- |
| M01 | Scope | All mockup changes are under `work/design/75-25-reader/`; `git diff --name-only` shows no application, data, Worker, workflow, package, public asset, or deployment change. | Automated |
| M02 | Isolation | Mockups do not import production components, fetch live or local APIs, contact the network, load remote fonts/assets, add a dependency, or require a framework. Repository sample content is copied into the mockup only. | Automated |
| M03 | Deliverables | Local-only Daily desktop, Weekly desktop, Daily mobile, and cadence-specific History views exist and can be opened without a production build or deployment. | Both |
| M04 | Brand | The product remains **AI Daily + Weekly Brief**. A single small terracotta-and-jade signal motif is present; “The Signal Desk,” the public-briefing badge, large hero copy, and decorative illustration are absent. | Visual/manual |
| M05 | Masthead | The desktop masthead is approximately 56–62px high, with quiet secondary navigation and no oversized product treatment. | Visual/manual |
| M06 | Daily desktop | At 1440 × 900 and 1280 × 800, the first story headline and part of its summary are visible without scrolling. The page is a centred 46–50rem single column. | Visual/manual |
| M07 | Daily header | The visible issue header contains only cadence, Melbourne issue date, story count, and publication status. Mix, source health, collection window, publication timestamp, and marketing sentence are absent. | Both |
| M08 | Daily controls | No search field, category filters, result count, or empty-search state appears in Daily. | Automated |
| M09 | Weekly controls | Weekly has one compact search-and-filter row below the dateline, with All, Executive, Technical, and Research choices. | Both |
| M10 | Story flow | Stories are flat rows separated by thin rules: no cards, rounded story containers, shadows, or category sidebar. | Both |
| M11 | Story hierarchy | Headlines use the body sans-serif family at approximately 17–18px desktop and 16–17px mobile, summaries are 14.5–15px at about 1.5 line height, and metadata is 11–12px. Headline and global terracotta number remain visibly stronger than summary and metadata. | Visual/manual |
| M12 | Story content | Every story shows a directly linked headline, a 35–75 word factual summary, and publisher/date/domain/discovery metadata. Category is not repeated inside story metadata. | Both |
| M13 | Numbering | Story numbers are global and stable across the issue (`01`–`05` Daily, `01`–`10` Weekly), not restarted by section. | Automated |
| M14 | Sections | Executive Signal uses terracotta, For Builders deep ink, and Research Watch jade. Each has a compact uppercase label, one thin rule, and a quiet short explanation. | Visual/manual |
| M15 | History | History includes a cadence switch, one cadence-specific search field, and compact expandable issue rows. Closed issues do not expose every historical summary. | Both |
| M16 | History search demonstration | The mockup visibly demonstrates matches by issue date, headline, publisher, and category, including a no-results and clear-search state. | Visual/manual |
| M17 | Mobile 390 | At 390 × 844, the hierarchy remains editorial and compact; navigation, story numbers, headlines, summaries, metadata, links, and History rows wrap without collision. | Visual/manual |
| M18 | Mobile 320 | At 320 × 568, there is no horizontal overflow, clipped focusable content, squeezed number/headline collision, or metadata truncation. A section explanation may stack or be hidden. | Both |
| M19 | Accessibility preview | Mockup HTML has one main landmark, logical heading order, labelled search controls, real buttons/links, visible keyboard focus, an operable skip link, and no meaning conveyed by colour alone. | Both |
| M20 | Editorial tone | Mockup summaries normally use two sentences: what changed, then why it matters or what qualifies it. They avoid headline repetition, promotional superlatives, unsupported conclusions, and source-like copied prose. | Visual/manual |

### Mockup go/no-go

**Go to implementation review** only when M01–M20 pass, all four views are
reviewable locally, and the user explicitly approves one coherent direction.

**No-go** if any production file changed, any mockup needs network or live data,
the first Daily story is not visible initially, Daily retains discovery
controls, mobile overflows, or the design achieves density by hiding required
story content.

## Gate 2 — implementation acceptance

These checks apply only after separate approval to edit the application.

### Reader and responsive behaviour

| ID | View or concern | Acceptance criterion | Verification |
| --- | --- | --- | --- |
| I01 | Daily desktop | M04–M08 and M10–M14 hold with real embedded data at both desktop viewports. Total Daily page height is at least 20% below the recorded baseline. | Both |
| I02 | Weekly desktop | Weekly renders ten stories in one column; search and lane filters work independently and together, counts update, clear restores all stories, and no-results messaging is announced. | Both |
| I03 | Control split | Daily renders no search/filter controls while Weekly renders exactly one labelled search and one four-choice filter group. The shared reader does not leak one cadence's state into the other. | Automated |
| I04 | Stable numbering | Filtering Weekly never renumbers a story; each number continues to represent original issue order. | Automated |
| I05 | Headline links | Every headline links to its strongest HTTPS source, opens safely, and has a visible hover/focus treatment. A duplicate “Open source” action is omitted unless user testing shows it is necessary. | Both |
| I06 | Metadata | Each story exposes publisher, Melbourne-formatted publication date, original domain, and discovery attribution when different. Category is represented by its section only. | Automated |
| I07 | Daily mobile | M17–M18 hold with the actual reader at 390 × 844 and 320 × 568, including long headline, long domain, and 75-word-summary cases. | Both |
| I08 | Navigation | Daily, Weekly, History, and How it works remain reachable by keyboard and direct hash URL; the active item is accurate after navigation and the main view starts at the top. | Both |
| I09 | Empty/fallback states | Missing live data, an unreachable API, an awaiting-cadence state, and a Weekly no-results state remain legible and do not break navigation. | Automated |
| I10 | CSS consolidation | Obsolete hero, card, category-sidebar, public-badge, and superseded override rules are removed rather than covered by another override layer. No unrelated system-page styling is lost. | Both |

### History

| ID | Concern | Acceptance criterion | Verification |
| --- | --- | --- | --- |
| H01 | Separate cadence | Daily and Weekly History remain distinct, their cadence switch reports the active page, and neither search changes the other cadence's retained runs. | Automated |
| H02 | Search coverage | A cadence History search matches issue date, headline, publisher, and category case-insensitively; clear restores all issues; no match produces an accessible empty state. | Automated |
| H03 | Expansion | Issues are compact collapsed rows with date, story count, and mix. Opening one is keyboard-operable and reveals only that issue's story list/details; collapsed issues do not render visible summaries. | Both |
| H04 | Result transparency | When a story field causes a match, the containing issue and matching story are understandable without expanding unrelated issues. | Visual/manual |
| H05 | Data naming | “Publisher” is derived consistently from existing story data and differs from discovery attribution when the evidence supports that distinction. No API/schema change is introduced solely for the redesign. | Both |

### Accessibility

| ID | Concern | Acceptance criterion | Verification |
| --- | --- | --- | --- |
| A01 | Structure | Each view has one main landmark, one descriptive `h1`, logical section headings, semantic articles/lists/details, and no skipped heading levels used for styling. | Automated |
| A02 | Names and states | Navigation, search, clear, filter, and disclosure controls have unique accessible names. Active navigation, pressed filters, expanded disclosures, result count, and empty states expose programmatic state. | Automated |
| A03 | Keyboard | Skip link, navigation, Weekly controls, History search/disclosures, and story links work without a pointer in a logical order; focus never becomes hidden or trapped. | Visual/manual |
| A04 | Focus and targets | Focus indication is clearly visible against every background. Interactive targets are at least 44 × 44 CSS pixels or have equivalent spacing without overlap. | Visual/manual |
| A05 | Contrast | Normal text and link text meet 4.5:1; large text and non-text UI/focus indicators meet 3:1. Terracotta/jade are not the sole category signal. | Both |
| A06 | Zoom/reflow | At 200% zoom and 320px CSS width, content reflows without two-dimensional scrolling or loss of functionality. | Visual/manual |
| A07 | Motion | Reduced-motion preference removes non-essential transitions or smooth scrolling. | Automated |

### Summary quality and old-run compatibility

| ID | Concern | Acceptance criterion | Verification |
| --- | --- | --- | --- |
| S01 | Publication rule | Every new published summary remains plain text, independently generated, and 35–75 words; markup, URLs, promotional language, excess source overlap, and invalid generation status are rejected. | Automated |
| S02 | Editorial shape | Sample and generated summaries state what changed, explain consequence/use, and include a material qualification when supported. Two sentences are preferred, not fabricated to satisfy a template. | Both |
| S03 | Weak language | Tests and editorial review reject mere headline restatement, source-description repetition, unsupported prediction, announcement superlatives, and phrases such as “marks a significant milestone” without evidence. | Both |
| S04 | Embedded samples | Daily and Weekly fallback samples demonstrate the approved summary standard and still pass publication validation. | Both |
| S05 | Version 2 history | A stored schema-version-2 run without `briefSummary` renders without error through the existing factual fallback; it remains visibly usable but is exempt from the new-summary word-count rule. | Automated |
| S06 | Public boundary | Internal source excerpts, model prompts, evidence text, credentials, and editorial-only fields do not appear in rendered HTML, client data, email, or API output. | Automated |

### Functional and operating invariants

| ID | Concern | Acceptance criterion | Verification |
| --- | --- | --- | --- |
| R01 | Mix | Daily accepts exactly five stories in a 3 executive / 1 technical / 1 research mix; Weekly accepts exactly ten in a 7/2/1 mix. | Automated |
| R02 | Cadence identity | Run identity remains `{cadence}:{Melbourne issue date}` and identical ingestion retries create no second record. | Automated |
| R03 | Retention | Exactly seven successful Daily runs and three successful Weekly runs are retained; retention deletion is cadence-scoped. | Automated |
| R04 | Last good run | Failed, partial, unhealthy, promotional, or insufficiently evidenced attempts cannot replace the current successful issue or enter History. | Automated |
| R05 | Sources | Existing source roles, evidence rules, direct-X prohibition, URL normalisation, and duplicate prevention are unchanged. | Automated |
| R06 | API/storage | Public API shapes, authenticated ingestion, database schema, and live-data-to-seed fallback remain compatible. | Automated |
| R07 | Daily email | Email can be requested only after the exact Daily run is accepted and stored; a retry cannot send twice; a changed payload cannot overwrite a sending/sent issue. | Automated |
| R08 | Weekly email | Weekly remains ineligible for email and produces no provider call. | Automated |
| R09 | Email presentation | Only the already-approved masthead/typography/token alignment changes. Recipient, sender, content, plain-text alternative, provider, delivery key, and delivery flow are unchanged. | Both |
| R10 | Public reader | No editor, approval, promote, registration, subscription, progress, preview-only, or administrative control appears. | Automated |
| R11 | Schedules and project | Daily/Weekly schedules, configuration, secrets, and the existing Sites project identity remain unchanged. | Automated |

### Required implementation evidence

Automated evidence:

```bash
cd work
npm test
npm run lint
git diff --check
```

The test suite must include focused assertions for the Daily/Weekly control
split, Weekly filtering, History search fields, stable numbering, schema-version
2 fallback, and all R01–R11 invariants. Static string assertions alone are not
sufficient evidence for interactive filtering and History search; use
testable pure matching/state logic or an interaction-capable test.

Manual evidence:

- screenshots at all four reference viewports;
- recorded baseline and redesigned Daily page heights at 1440 × 900;
- keyboard-only pass;
- 200% zoom/reflow pass;
- contrast measurements for ink, muted text, terracotta, jade, links, rules,
  controls, and focus indicators;
- long-content stress pass;
- confirmation that no email or production action occurred.

### Implementation go/no-go

**Go to release review** only when every applicable I, H, A, S, and R criterion
passes, all required commands are green, the finished local website is reviewed
by the user, and the user explicitly approves release.

**No-go** for test failure, unresolved accessibility defect, missing History
search mode, ambiguous publisher attribution, schema/API drift, extra CSS
override accumulation, reduced content masquerading as reduced scroll depth,
or any cadence/retention/publication/email regression.

## Gate 3 — release acceptance

| ID | Concern | Acceptance criterion | Verification |
| --- | --- | --- | --- |
| L01 | Authority | Release has a separate explicit user approval; mockup or implementation approval is not treated as deployment approval. | Manual |
| L02 | Canonical source | The exact validated change is merged into GitHub `main`; the deployed source identifies that merged commit. | Automated |
| L03 | Existing project | Deployment reuses the project in `work/.openai/hosting.json`; no replacement Sites project, secret change, migration, or scheduler change is introduced. | Automated |
| L04 | Production health | The live health endpoint succeeds and Daily, Weekly, both History views, How it works, and cadence APIs load from the public URL. | Both |
| L05 | Live visual pass | Desktop and both phone widths retain the approved hierarchy, compactness, focus treatment, wrapping, and no-overflow result after production assets load. | Visual/manual |
| L06 | Data preservation | Current accepted Daily and Weekly issues and their separate retained histories remain present after deployment. | Automated |
| L07 | Email safety | The visual release does not manually trigger collection or email. Existing delivery configuration remains unchanged; automated tests provide the email-regression evidence. | Both |
| L08 | Handoff | Release report names the merged commit, production version, public URL, checks performed, and any known limitation without claiming an unverified result. | Manual |

### Release go/no-go

**Go** only when L01–L08 pass against the exact merged artifact on the existing
project.

**No-go or rollback** if the live build differs from the approved artifact,
health/data/history checks fail, content is lost, mobile overflow returns, a
secret or project identity changed unexpectedly, or an email/collector run was
triggered as part of the visual deployment.

## Known risks to resolve before implementation approval

1. `CadenceView` currently gives Daily and Weekly the same search/filter
   controls. The implementation needs an explicit cadence split and independent
   tests rather than CSS-only hiding.
2. The current story type has no first-class `publisher` field, and
   `sourceLabel()` prefers discovery attribution before the original domain.
   Define and test one deterministic publisher label from existing data before
   implementing History publisher search; do not silently label a discovery
   newsletter as the original publisher.
3. Current rendered-page tests assert that Daily contains the shared search and
   four filters. Those assertions must be replaced with separate Daily absence
   and Weekly presence/interaction coverage.
4. Current History has cadence switching and expandable rows but no search.
   Static prerender checks alone will not prove History matching or clearing.
5. The stylesheet contains older rules plus later compact override blocks.
   The redesign must consolidate them, because adding another override block
   would preserve the complexity this change is intended to remove.
6. The schema-version-2 fallback is implemented but lacks a focused reader
   compatibility test. Add one before release.
