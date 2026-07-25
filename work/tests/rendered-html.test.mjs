import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function renderedHtml() {
  return readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
}

async function clientBundle() {
  const html = await renderedHtml();
  const source = html.match(/<script[^>]+src="([^"]+\.js)"/i)?.[1];
  assert.ok(source, "Expected the production client bundle");
  return readFile(new URL(`../dist/client${source}`, import.meta.url), "utf8");
}

test("statically renders the complete public Daily briefing", async () => {
  const html = await renderedHtml();

  assert.match(html, /<title>AI Daily \+ Weekly Brief<\/title>/i);
  assert.match(html, /The signal/);
  assert.match(html, /beneath the noise\./);
  assert.match(html, /Published automatically/);
  assert.match(
    html,
    /7(?:<!-- -->)?\/(?:<!-- -->)?7(?:<!-- -->)? healthy/,
  );
  assert.match(html, /href="#daily"/);
  assert.match(html, /href="#weekly"/);
  assert.match(html, /href="#history-daily"/);
  assert.match(html, /href="#system"/);
  assert.match(html, /How it works/);
  assert.match(html, /og\.png/i);
  assert.match(html, /summary_large_image/i);
  assert.equal((html.match(/data-story-card="true"/g) ?? []).length, 5);

  await access(new URL("../dist/client/og.png", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});

test("keeps editorial controls out of the public reader", async () => {
  const html = await renderedHtml();

  assert.doesNotMatch(html, /Editorial review required/i);
  assert.doesNotMatch(html, /Approve/i);
  assert.doesNotMatch(html, /Promote/i);
  assert.doesNotMatch(html, /role="progressbar"/i);
  assert.doesNotMatch(html, /codex-preview/i);
  assert.doesNotMatch(html, /javascript:/i);
});

test("renders accessible reader controls", async () => {
  const html = await renderedHtml();

  assert.match(html, /<label[^>]+for="brief-search"/i);
  assert.match(html, /id="brief-search"[^>]+type="search"/i);
  assert.match(html, /role="group"[^>]+aria-label="Filter by lane"/i);
  assert.equal((html.match(/data-filter=/g) ?? []).length, 4);
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 4);
  assert.match(html, /class="skip-link" href="#view-content"/i);
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
});

test("keeps separate Daily and Weekly reader histories", async () => {
  const bundle = await clientBundle();

  assert.match(bundle, /history-daily/);
  assert.match(bundle, /history-weekly/);
  assert.match(bundle, /api\/runs\?cadence=/);
  assert.match(bundle, /Daily email/);
});

test("links the system page to its durable repository memory", async () => {
  const bundle = await clientBundle();

  assert.match(
    bundle,
    /https:\/\/github\.com\/tamirlevin\/daily-newsletter/,
  );
  assert.match(bundle, /daily-newsletter\/blob\/main\/AGENTS\.md/);
  assert.match(bundle, /Built to be resumed, not remembered\./);
});
