# AI Weekly Brief

A concise, editorially reviewed AI briefing for executive, technical, and
research readers.

The public reader is hosted on GitHub Pages:

<https://tamirlevin.github.io/daily-newsletter/>

The implementation, source policy, and local operating instructions live in
[`work/README.md`](work/README.md).

## Automation

- **Publish public briefing** validates and deploys the approved
  `work/data/issue.json` whenever `main` changes.
- **Collect weekly candidates** runs every Friday morning in Melbourne and can
  also be started manually. It creates a review artifact but never publishes
  or overwrites the approved issue.

No API keys are required for the current public-source collectors.
