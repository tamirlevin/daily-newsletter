import assert from "node:assert/strict";
import test from "node:test";
import { identifyModelLabVendors } from "../../lib/model-labs.mjs";

test("identifies model labs from first-party subdomains", () => {
  const cases = [
    ["https://platform.openai.com/docs", "openai"],
    ["https://developers.openai.com/codex", "openai"],
    ["https://api.mistral.ai/v1/models", "mistral"],
    ["https://docs.cohere.com/docs/models", "cohere"],
    ["https://chat.qwen.ai/", "alibaba"],
  ];

  for (const [url, vendor] of cases) {
    assert.deepEqual(identifyModelLabVendors({ url }), [vendor]);
  }
});

test("identifies model labs in third-party coverage of named model families", () => {
  const cases = [
    ["GPT-5.4 ships a new tool-use mode", "openai"],
    ["Codex adds background automation", "openai"],
    ["Sora expands enterprise access", "openai"],
    ["Meta reorganizes its AI lab", "meta"],
    ["Qwen3.8-Max raises the bar for coding", "alibaba"],
  ];

  for (const [title, vendor] of cases) {
    assert.deepEqual(
      identifyModelLabVendors({ title, url: "https://example.com/story" }),
      [vendor],
    );
  }
});

test("does not treat a former lab affiliation as a lab-led story", () => {
  assert.deepEqual(
    identifyModelLabVendors({
      title: "Former OpenAI exec launches a healthcare startup",
      url: "https://example.com/healthcare-startup",
    }),
    [],
  );
});
