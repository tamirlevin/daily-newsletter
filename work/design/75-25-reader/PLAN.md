# 75/25 reader redesign plan

Status: approved for mockup and QA-definition work only.

This document is the durable design brief for a proposed reader refinement.
It combines approximately 75% of the compact, newspaper-like restraint shown
in the Claude one-shot with 25% of the live product's stronger hierarchy,
global story numbering, brand signal, and interaction polish.

No production application, collection, publication, storage, email, scheduler,
or deployment change is approved by this plan. The next approval gate is the
review of local mockups and QA criteria.

## Product outcome

Make the Daily briefing feel like a calm morning memo:

- narrow, comfortable editorial measure;
- a flat story flow with thin rules instead of cards;
- materially less scrolling and visual ceremony;
- clearly linked headlines and useful summaries;
- one restrained brand signal;
- stronger headline hierarchy and global story numbering.

Weekly and History may retain compact discovery controls because they contain
more material. Daily should prioritise immediate reading.

The product remains **AI Daily + Weekly Brief**. Renaming it to “The Signal
Desk” or any other title is outside this design change.

## Scope boundary

The future implementation may change:

- Daily and Weekly issue presentation;
- masthead and issue-header presentation;
- story typography, numbering, and metadata;
- search and filter placement;
- History presentation and search;
- summary-writing guidance and embedded samples;
- responsive styling;
- the social sharing card if the approved first viewport materially changes.

The future implementation must preserve:

- all configured sources and source roles;
- Daily's exact 3 executive / 1 technical / 1 research mix;
- Weekly's exact 7 executive / 2 technical / 1 research mix;
- collection schedules and Melbourne issue identity;
- seven retained Daily runs and three retained Weekly runs;
- source-health, evidence, publication, and last-good-run safeguards;
- database and public API behaviour;
- the single-recipient, Daily-only, idempotent email workflow;
- the existing Sites project.

## Mockup deliverables

Create local-only mockups under:

`work/design/75-25-reader/mockups/`

The mockups must not import, overwrite, or alter files under `work/app/`,
`work/worker/`, `work/lib/`, `work/scripts/`, `work/data/`, `work/public/`,
`work/drizzle/`, or `.github/`.

Required views:

1. Daily at a normal desktop viewport.
2. Weekly at a normal desktop viewport.
3. Daily at a narrow mobile viewport.
4. A cadence-specific History view showing the proposed search and compact
   expandable issue treatment.

Use realistic content from the repository's embedded Daily and Weekly runs,
copied into the mockup surface only. The mockup must not fetch live production
data.

Use HTML, CSS, and only the small amount of JavaScript needed to demonstrate
the proposed controls. Do not introduce a framework, package, image, font
download, generated illustration, or new dependency.

## Layout specification

### Masthead

- one compact row approximately 56–62 pixels high;
- preserve the current product name;
- retain one small terracotta-and-jade signal motif;
- keep navigation visually secondary;
- remove the public-briefing badge;
- no large product tagline or decorative hero.

### Issue header

Replace the current hero with a compact dateline treatment:

```text
DAILY BRIEFING · Sunday 26 July 2026
5 stories · Published automatically
```

The visible header should contain:

- cadence;
- Melbourne issue date;
- story count;
- publication status.

Do not show the editorial mix, source-health count, generation window, or
publication timestamp in the main issue header. Those details may remain in
the explanatory view in a future implementation.

The first story headline and part of its summary should be visible in the
initial desktop viewport.

### Reading measure

- centre a main column approximately 46–50rem wide;
- remove the category sidebar from issue views;
- use a single reading column;
- use thin rules rather than cards, shadows, or rounded story containers;
- preserve sufficient whitespace for comprehension without turning each story
  into a panel.

### Section treatment

- compact uppercase section heading;
- one thin rule;
- Executive Signal uses terracotta;
- For Builders uses deep ink;
- Research Watch uses jade;
- retain one short section explanation, rendered quietly;
- the explanation may stack or disappear at the narrowest mobile width when
  needed for clarity.

## Story specification

Each story is one compact, globally numbered row:

```text
01
Headline linked directly to the original source

35–75 word summary explaining what happened and why it matters.

Publisher · 26 Jul 2026 · domain · found via discovery source
```

Typography targets:

- headline: approximately 20–22px on desktop and 19–21px on mobile;
- summary: approximately 14.5–15px with a 1.5 line height;
- metadata: approximately 11–12px;
- headline and number must remain visually stronger than metadata;
- serif headlines, sans-serif summaries and metadata;
- visible but restrained link underline;
- terracotta global story number.

Metadata should retain:

- publisher;
- publication date;
- original domain;
- discovery attribution when different from the publisher.

Do not repeat the category inside each story's metadata because the containing
section already communicates it.

## Control specification

### Daily

Do not show search or category-filter controls. Five stories are faster to scan
than to filter.

### Weekly

Retain search and category filters in one compact row below the dateline.

### History

Provide one simple search field per cadence history. Search should match:

- issue date;
- headline;
- publisher;
- category.

Keep issues as compact expandable rows. Do not render all historical summaries
until an issue is opened.

## Summary-writing direction

The future implementation should revise summaries toward:

1. what changed;
2. why it is consequential or useful;
3. a material qualification when the evidence provides one.

Prefer two sentences:

- sentence one describes the event;
- sentence two explains consequence, use, or context;
- total length remains 35–75 words.

Reject:

- summaries that merely restate the headline;
- source-description repetition;
- promotional framing and announcement superlatives;
- phrases such as “marks a significant milestone” without evidence;
- unsupported interpretation or prediction.

Mockups should demonstrate this editorial standard without modifying embedded
production samples.

## Implementation sequence after mockup approval

1. Translate the approved mockup into the existing reader components.
2. Replace obsolete hero, card, sidebar, and override styles rather than adding
   another large CSS override layer.
3. Apply the approved summary-writing direction and update embedded samples.
4. Align the existing compact email's masthead and typography only; do not
   alter delivery behaviour.
5. Update rendered-page, interaction, accessibility, and summary tests.
6. Run the complete build, test, lint, and diff checks.
7. Present the finished local build.
8. Merge and deploy only after a separate release approval.

## QA acceptance summary

The separate QA criteria must cover at least:

- first-story visibility in the initial desktop viewport;
- materially reduced Daily scroll depth;
- headline-versus-summary hierarchy;
- absence of cards and the category sidebar;
- no Daily search or filters;
- working Weekly and History discovery controls;
- clean wrapping and no horizontal overflow at 320px;
- keyboard, focus, contrast, and semantic accessibility;
- graceful rendering of older runs;
- preservation of cadence, retention, publication, and email invariants;
- no changes outside the approved design and mockup directories during this
  mockup phase.
