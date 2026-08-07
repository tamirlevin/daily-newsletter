# AI Daily + Weekly Brief

Public, automatically refreshed Daily and Weekly AI briefings for executive,
technical, and builder readers.

Live site:
[ai-weekly-brief.tamirlevin300024.chatgpt.site](https://ai-weekly-brief.tamirlevin300024.chatgpt.site/)

The system has two moving parts:

- GitHub Actions uses the same collectors to assemble five Daily stories and
  ten Weekly stories on separate schedules, then uses GitHub Models to attempt
  concise evidence-grounded summaries with the workflow's automatic token.
- Sites validates, stores, and serves both cadences. It retains seven
  successful Daily runs and three successful Weekly runs.
- An accepted Daily run triggers one idempotent email to the configured
  recipient. Weekly remains a web briefing.

The reader includes **Daily**, **Weekly**, cadence-specific **History**, and
**How it works** views. Daily and Weekly use a compact continuous reading
layout with source-linked headlines and factual summaries when available. A
summary failure leaves the validated item as a compact source-linked row rather
than blocking the issue. Direct X collection is intentionally excluded;
specific X links discovered through the configured public sources remain
eligible.

Implementation and local operating instructions live in
[`work/README.md`](work/README.md).

Future Codex sessions should start with [`AGENTS.md`](AGENTS.md), which records
the architecture, durable decisions, change recipes, and release checks.
