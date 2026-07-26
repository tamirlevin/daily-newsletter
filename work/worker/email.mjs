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

const LANE_ORDER = ["executive", "technical", "research"];

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

function storySource(story) {
  return (
    story.discoveredBy?.[0] ??
    story.originalDomain?.replace(/^www\./, "") ??
    "Source"
  );
}

function storyDomain(story) {
  return story.originalDomain?.replace(/^www\./, "") ?? storySource(story);
}

function storyDiscovery(story) {
  const sources = [...new Set(story.discoveredBy ?? [])].slice(0, 3);
  return sources.length > 0 ? `Discovered via ${sources.join(" + ")}` : "";
}

function storyDate(story) {
  const date = new Date(story.publishedAt);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    day: "numeric",
    month: "short",
  }).format(date);
}

function storyHtml(story, index, isLast) {
  const meta = [
    String(index + 1).padStart(2, "0"),
    storyDate(story),
    story.readingTime,
  ].filter(Boolean);
  return `
    <tr>
      <td style="padding:14px 0 ${isLast ? "4px" : "15px"};border-bottom:${isLast ? "0" : `1px solid ${COLOURS.rule}`}">
        <p style="margin:0 0 6px;font:700 10px/1.4 Arial,sans-serif;letter-spacing:.11em;text-transform:uppercase;color:${COLOURS.muted}">
          ${escapeHtml(meta.join(" · "))}
        </p>
        <h3 style="margin:0 0 7px;font:700 17px/1.3 Arial,sans-serif;color:${COLOURS.ink}">
          <a href="${escapeHtml(story.url)}" style="color:${COLOURS.ink};text-decoration:underline;text-decoration-color:${COLOURS.accent};text-decoration-thickness:1px;text-underline-offset:3px">${escapeHtml(story.title)}</a>
        </h3>
        <p style="margin:0 0 8px;font:400 14px/1.5 Arial,sans-serif;color:${COLOURS.ink}">
          ${escapeHtml(story.briefSummary)}
        </p>
        <p style="margin:0;font:600 10px/1.45 Arial,sans-serif;letter-spacing:.04em;color:${COLOURS.muted}">
          ${escapeHtml(storyDomain(story))}
          ${storyDiscovery(story) ? ` &nbsp;·&nbsp; ${escapeHtml(storyDiscovery(story))}` : ""}
        </p>
      </td>
    </tr>`;
}

export function renderDailyEmail(run, publicBaseUrl) {
  const issueLabel = formatIssueDate(run.issueDate);
  const readerUrl = new URL("/#daily", publicBaseUrl).toString();
  const subject = `AI Daily Brief — ${issueLabel}`;
  const stories = run.items ?? [];
  const sections = LANE_ORDER
    .map((lane) => ({
      lane,
      stories: stories.filter((story) => story.editorialLane === lane),
    }))
    .filter((section) => section.stories.length > 0);
  let storyIndex = 0;
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:${COLOURS.paper}">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent">
      Five consequential AI developments, selected for signal over volume.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOURS.paper}">
      <tr>
        <td align="center" style="padding:16px 10px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:${COLOURS.card};border:1px solid ${COLOURS.rule}">
            <tr>
              <td style="padding:18px 22px 14px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font:700 12px/1.4 Arial,sans-serif;color:${COLOURS.ink}">
                      AI Daily + Weekly Brief
                    </td>
                    <td align="right" style="font:600 11px/1.4 Arial,sans-serif">
                      <a href="${escapeHtml(readerUrl)}" style="color:${COLOURS.muted};text-decoration:underline">View in reader</a>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:11px;padding-top:13px;border-top:1px solid ${COLOURS.rule}">
                  <p style="margin:0 0 6px;font:700 10px/1.4 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:${COLOURS.accent}">
                    Daily brief · Melbourne
                  </p>
                  <h1 style="margin:0 0 6px;font:700 21px/1.25 Arial,sans-serif;color:${COLOURS.ink}">
                    Five AI developments worth your attention
                  </h1>
                  <p style="margin:0;font:400 13px/1.45 Arial,sans-serif;color:${COLOURS.muted}">
                    ${escapeHtml(issueLabel)} · Ranked for decisions, builders, and research direction.
                  </p>
                </div>
              </td>
            </tr>
            ${sections.map((section) => `
              <tr>
                <td style="padding:0 22px 13px">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:10px 0 0;border-top:2px solid ${COLOURS.ink}">
                        <p style="margin:0;font:700 10px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${COLOURS.accent}">
                          ${escapeHtml(LANE_LABELS[section.lane])}
                          <span style="color:${COLOURS.muted}">&nbsp;&nbsp;${section.stories.length} ${section.stories.length === 1 ? "story" : "stories"}</span>
                        </p>
                      </td>
                    </tr>
                    ${section.stories.map((story, index) =>
                      storyHtml(
                        story,
                        storyIndex++,
                        index === section.stories.length - 1,
                      )).join("")}
                  </table>
                </td>
              </tr>`).join("")}
            <tr>
              <td align="center" style="padding:3px 22px 18px">
                <a href="${escapeHtml(readerUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:${COLOURS.ink};color:#ffffff;font:700 13px/1 Arial,sans-serif;text-decoration:none">
                  Open the full Daily reader →
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 22px;border-top:1px solid ${COLOURS.rule};font:400 11px/1.5 Arial,sans-serif;color:${COLOURS.muted}">
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
      story.briefSummary,
      story.url,
      "",
    ]),
    `Open the Daily reader: ${readerUrl}`,
  ].join("\n");

  return { subject, html, text };
}
