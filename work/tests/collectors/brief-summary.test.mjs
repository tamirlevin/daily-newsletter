import assert from "node:assert/strict";
import test from "node:test";
import {
  briefSummaryWordCount,
  generateBriefSummaries,
  validateBriefSummary,
} from "../../lib/brief-summary.mjs";

const candidate = {
  id: "story-1",
  title: "A material AI infrastructure agreement",
  url: "https://example.com/story",
  publishedAt: "2026-07-25T00:00:00.000Z",
  editorialLane: "executive",
  originalDomain: "example.com",
  discoveredBy: ["Example Brief"],
  editorialText:
    "The companies signed a multiyear infrastructure agreement. The buyer will deploy new accelerator systems in several phases. Financial terms were not disclosed.",
  summaryEvidenceText:
    "The agreement covers phased deployment of accelerator systems and associated software. Both companies said implementation begins this year.",
};

test("accepts concise, factual plain-text summaries", () => {
  const summary =
    "Two companies agreed to deploy accelerator systems and related software through a phased, multiyear infrastructure programme. Implementation is scheduled to begin this year, while the parties have not disclosed the financial terms or the exact number of systems covered.";

  assert.equal(validateBriefSummary(summary), summary);
  assert.equal(briefSummaryWordCount(summary), 39);
});

test("rejects missing, promotional, copied, and out-of-range summaries", () => {
  assert.throws(
    () => validateBriefSummary("Too short to publish safely."),
    /35-75 words/,
  );
  assert.throws(
    () =>
      validateBriefSummary(
        "This revolutionary and game-changing service will transform your organisation with exceptional artificial intelligence capabilities. It offers a carefully designed operating model, dependable implementation support, flexible deployment paths, measurable benefits, and practical controls for teams that need results without delay.",
      ),
    /promotional language/,
  );
  const copied =
    "The companies signed a multiyear infrastructure agreement the buyer will deploy new accelerator systems in several phases financial terms were not disclosed. This sentence adds enough words to keep the copied example inside the accepted publication length for testing.";
  assert.throws(
    () =>
      validateBriefSummary(copied, {
        sourceMaterial: candidate.editorialText,
      }),
    /repeats too much source wording/,
  );
});

test("generates one independently validated summary per selected story", async () => {
  const summary =
    "Two companies agreed to roll out accelerator hardware and supporting software through a phased infrastructure programme. Work is expected to start this year, but the source material does not specify the commercial value or the total number of systems involved.";
  let request;
  const summaries = await generateBriefSummaries([candidate], {
    token: "github-token",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                summaries: [{ id: candidate.id, summary }],
              }),
            },
          }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  assert.deepEqual(summaries, [summary]);
  assert.equal(
    request.url,
    "https://models.github.ai/inference/chat/completions",
  );
  assert.equal(request.init.headers.authorization, "Bearer github-token");
  const body = JSON.parse(request.init.body);
  assert.equal(body.model, "openai/gpt-4o-mini");
  assert.match(body.messages[0].content, /untrusted data/);
});

test("keeps valid summaries when another selected story has invalid output", async () => {
  const secondCandidate = {
    ...candidate,
    id: "story-2",
    title: "A second material AI infrastructure agreement",
  };
  const summary =
    "Two companies agreed to roll out accelerator hardware and supporting software through a phased infrastructure programme. Work is expected to start this year, but the source material does not specify the commercial value or the total number of systems involved.";
  const failures = [];

  const summaries = await generateBriefSummaries(
    [candidate, secondCandidate],
    {
      token: "github-token",
      onFailure: (failure) => failures.push(failure),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{
              message: {
                content: JSON.stringify({
                  summaries: [
                    { id: candidate.id, summary },
                    {
                      id: secondCandidate.id,
                      summary: "Too short to publish safely.",
                    },
                  ],
                }),
              },
            }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    },
  );

  assert.deepEqual(summaries, [summary, null]);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].id, secondCandidate.id);
  assert.match(failures[0].error.message, /35-75 words/);
});

test("marks an omitted story unavailable without discarding valid summaries", async () => {
  const secondCandidate = {
    ...candidate,
    id: "story-2",
    title: "A second material AI infrastructure agreement",
  };
  const summary =
    "Two companies agreed to roll out accelerator hardware and supporting software through a phased infrastructure programme. Work is expected to start this year, but the source material does not specify the commercial value or the total number of systems involved.";

  const summaries = await generateBriefSummaries(
    [candidate, secondCandidate],
    {
      token: "github-token",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{
              message: {
                content: JSON.stringify({
                  summaries: [{ id: candidate.id, summary }],
                }),
              },
            }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    },
  );

  assert.deepEqual(summaries, [summary, null]);
});
