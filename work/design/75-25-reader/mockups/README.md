# 75/25 reader mockups

These local-only pages demonstrate the approved reader direction without
importing or changing the production application.

## Open the views

Open `index.html` in a browser and use its links, or open a view directly:

- `daily.html` — responsive Daily issue; resize the browser to inspect mobile.
- `daily-mobile.html` — the Daily issue inside a fixed 320px review frame.
- `weekly.html` — Weekly issue with working search and category filters.
- `history.html` — cadence-specific Daily History with working search and
  three illustrative expandable issue rows from the seven-run retention.

For the most reliable local navigation, serve this folder with any static file
server. From the repository root, one option is:

```bash
cd work/design/75-25-reader/mockups
python3 -m http.server 4312
```

Then visit <http://127.0.0.1:4312/>.

No package installation, build step, live API, external font, image, or network
connection is required.

## Review notes

- Story content is copied from the embedded Daily and Weekly sample runs.
- The Daily view intentionally has no search or category filters.
- The Weekly controls filter the ten visible stories.
- History search matches dates, headlines, publishers, and categories.
- The pages use semantic landmarks, visible keyboard focus, labelled controls,
  live result counts, and native expandable history rows.
- The mockups are illustrative only. They do not change collection, storage,
  email, or production reader behaviour.
