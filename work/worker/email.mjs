const LANE_LABELS = Object.freeze({
  executive: "Executive signal",
  technical: "For builders",
  research: "Research watch",
});

const COLOURS = Object.freeze({
  ink: "#17211d",
  muted: "#66706b",
  paper: "#f5f1e8",
  card: "#fffdf8",
  rule: "#d8d0c2",
  accent: "#c95d3f",
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatIssueDate(value) {
  const date = new Date(`${value}T12:00:00+10:00`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function storyReason(story) {
  return (story.selectionReasons ?? [])
    .filter((reason) => !String(reason).endsWith(" lane"))
    .slice(0, 2)
    .join(" · ");
}

function storySource(story) {
  return (
    story.discoveredBy?.[0] ??
    story.originalDomain?.replace(/^www\./, "") ??
    "Source"
  );
}

function storyHtml(story, index) {
  return `
    <tr>
      <td style="padding:0 0 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOURS.card};border:1px solid ${COLOURS.rule};border-radius:14px">
          <tr>
            <td style="padding:22px 24px">
              <p style="margin:0 0 9px;font:700 11px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${COLOURS.accent}">
                ${String(index + 1).padStart(2, "0")} · ${escapeHtml(LANE_LABELS[story.editorialLane] ?? story.editorialLane)}
              </p>
              <h2 style="margin:0 0 12px;font:700 23px/1.18 Georgia,serif;color:${COLOURS.ink}">
                <a href="${escapeHtml(story.url)}" style="color:${COLOURS.ink};text-decoration:none">${escapeHtml(story.title)}</a>
              </h2>
              <p style="margin:0 0 14px;font:400 14px/1.55 Arial,sans-serif;color:${COLOURS.muted}">
                ${escapeHtml(storyReason(story))}
              </p>
              <p style="margin:0;font:600 12px/1.4 Arial,sans-serif;color:${COLOURS.ink}">
                ${escapeHtml(storySource(story))} &nbsp;·&nbsp;
                <a href="${escapeHtml(story.url)}" style="color:${COLOURS.accent}">Read source →</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

export function renderDailyEmail(run, publicBaseUrl) {
  const issueLabel = formatIssueDate(run.issueDate);
  const readerUrl = new URL("/#daily", publicBaseUrl).toString();
  const subject = `AI Daily Brief — ${issueLabel}`;
  const stories = run.items ?? [];
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:${COLOURS.paper}">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent">
      Five consequential AI developments, selected for signal over volume.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOURS.paper}">
      <tr>
        <td align="center" style="padding:28px 14px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px">
            <tr>
              <td style="padding:0 4px 24px">
                <p style="margin:0 0 10px;font:700 12px/1.4 Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:${COLOURS.accent}">
                  AI Daily Brief · Melbourne
                </p>
                <h1 style="margin:0 0 12px;font:700 38px/1.05 Georgia,serif;color:${COLOURS.ink}">
                  The signal beneath the noise.
                </h1>
                <p style="margin:0;font:400 16px/1.55 Arial,sans-serif;color:${COLOURS.muted}">
                  ${escapeHtml(issueLabel)} · Five developments ranked for decisions, builders, and research direction.
                </p>
              </td>
            </tr>
            ${stories.map(storyHtml).join("")}
            <tr>
              <td align="center" style="padding:10px 4px 22px">
                <a href="${escapeHtml(readerUrl)}" style="display:inline-block;padding:13px 20px;border-radius:999px;background:${COLOURS.ink};color:#ffffff;font:700 14px/1 Arial,sans-serif;text-decoration:none">
                  Open the Daily reader
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 4px;border-top:1px solid ${COLOURS.rule};font:400 12px/1.5 Arial,sans-serif;color:${COLOURS.muted}">
                Sent automatically only after Sites accepted this Daily run.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    subject,
    "",
    "Five consequential AI developments, selected for signal over volume.",
    "",
    ...stories.flatMap((story, index) => [
      `${index + 1}. ${story.title}`,
      `${LANE_LABELS[story.editorialLane] ?? story.editorialLane} · ${storySource(story)}`,
      storyReason(story),
      story.url,
      "",
    ]),
    `Open the Daily reader: ${readerUrl}`,
  ].join("\n");

  return { subject, html, text };
}
