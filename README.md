# AI Weekly Brief

A public, automatically refreshed AI briefing for executive, technical, and
research readers.

Live site:
[ai-weekly-brief.tamirlevin300024.chatgpt.site](https://ai-weekly-brief.tamirlevin300024.chatgpt.site/)

The system has two moving parts:

- GitHub Actions collects, deduplicates, ranks, and checks ten stories every
  Friday or on demand.
- Sites publishes the latest valid run and retains the current run plus the two
  immediately before it.

The reader includes **Latest**, **History**, and **How it works** views. Direct X
collection is intentionally excluded; specific X links discovered through the
configured public sources remain eligible.

Implementation and local operating instructions live in
[`work/README.md`](work/README.md).

Future Codex sessions should start with [`AGENTS.md`](AGENTS.md), which records
the architecture, durable decisions, change recipes, and release checks.
