import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseArgs, runCli } from "../src/cli.mjs";
import { HelveClient } from "../src/client.mjs";
import { buildToolPlan, runCollectors } from "../src/sources.mjs";
import { renderMarkdown } from "../src/render.mjs";

test("parseArgs parses company, flags, and defaults", () => {
  const opts = parseArgs([
    "NVIDIA",
    "--ticker",
    "NVDA",
    "--cik",
    "0001045810",
    "--url",
    "https://www.nvidia.com",
    "--synthesize",
    "--max-cost",
    "0.15",
    "--out",
    "nvda.md",
  ]);
  assert.equal(opts.company, "NVIDIA");
  assert.equal(opts.ticker, "NVDA");
  assert.equal(opts.cik, "0001045810");
  assert.equal(opts.url, "https://www.nvidia.com");
  assert.equal(opts.synthesize, true);
  assert.equal(opts.maxCostUsd, 0.15);
  assert.equal(opts.out, "nvda.md");
});

test("buildToolPlan emits live-schema-compliant arguments for every tool", () => {
  const plan = buildToolPlan({
    company: "NVIDIA",
    ticker: "NVDA",
    url: "https://www.nvidia.com",
    cik: "0001045810",
  });
  const byId = Object.fromEntries(plan.map((p) => [p.toolId, p.args]));

  assert.deepEqual(byId["helve.web_extract"].urls, ["https://www.nvidia.com"]);
  assert.equal(byId["helve.web_extract"].content.format, "markdown");
  assert.equal(typeof byId["helve.web_extract"].content.max_chars, "number");

  assert.equal(byId["exa.find_similar"].url, "https://www.nvidia.com");
  assert.equal(typeof byId["exa.find_similar"].num_results, "number");
  assert.equal(typeof byId["exa.find_similar"].exclude_source_domain, "boolean");
  assert.equal(typeof byId["exa.find_similar"].include_text, "boolean");

  assert.equal(typeof byId["exa.answer"].query, "string");
  assert.equal(byId["exa.answer"].text, true);

  assert.equal(typeof byId["sec_edgar.search_filings"].q, "string");
  assert.equal(typeof byId["sec_edgar.search_filings"].limit, "number");
  assert.equal(byId["sec_edgar.xbrl_concept"].taxonomy, "us-gaap");
  assert.equal(byId["sec_edgar.xbrl_concept"].tag, "Revenues");
});

test("HelveClient handles 402 spend_limit_exceeded and 502 failed-call escrow ($0)", async () => {
  const mockFetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.tool_id === "exa.answer") {
      return new Response(
        JSON.stringify({ error: { code: "spend_limit_exceeded", message: "Key budget cap reached" } }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      );
    }
    if (body.tool_id === "brave.news_search") {
      return new Response(
        JSON.stringify({ error: { code: "upstream_error", message: "Provider 502" } }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        tool_id: body.tool_id,
        provider: "sec_edgar",
        latency_ms: 120,
        data: { filings: [] },
        usage: { cost_usd: 0.0, provider_cost_usd: 0.0, platform_fee_usd: 0.0, credits: 0 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const client = new HelveClient({ apiKey: "sk_live_test", fetchImpl: mockFetch });
  const capped = await client.callTool("exa.answer", { query: "test", text: true });
  assert.equal(capped.ok, false);
  assert.equal(capped.status, "budget_capped");
  assert.equal(capped.costUsd, 0);

  const failed = await client.callTool("brave.news_search", { q: "test", count: 5 });
  assert.equal(failed.ok, false);
  assert.equal(failed.status, "failed");
  assert.equal(failed.costUsd, 0);
});

test("runCollectors enforces client-side --max-cost before optional synthesis", async () => {
  const stubClient = {
    async callTool(toolId) {
      return {
        ok: true,
        toolId,
        provider: "stub",
        latencyMs: 10,
        costUsd: 0.05,
        data: { results: [] },
        warnings: [],
        status: "ok",
        error: null,
      };
    },
  };

  const report = await runCollectors(stubClient, {
    company: "Acme",
    synthesize: true,
    maxCostUsd: 0.1,
    includeNews: false,
    includeCommunity: false,
  });

  const synthEntry = report.ledger.find((e) => e.key === "synthesis");
  assert.ok(synthEntry);
  assert.equal(synthEntry.status, "budget_capped");
  assert.equal(synthEntry.costUsd, 0);
});

test("CLI --demo end-to-end writes clean Markdown dossier with cost ledger", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dossier-"));
  const outPath = join(dir, "nvda.md");
  let stderrBuf = "";
  let stdoutBuf = "";

  const code = await runCli(
    ["NVIDIA", "--ticker", "NVDA", "--cik", "0001045810", "--url", "https://www.nvidia.com", "--synthesize", "--demo", "--out", outPath],
    {
      stdout: { write: (s) => (stdoutBuf += s) },
      stderr: { write: (s) => (stderrBuf += s) },
      env: {},
    }
  );

  assert.equal(code, 0);
  const md = readFileSync(outPath, "utf8");
  assert.match(md, /# Company Research Dossier: NVIDIA \(NVDA\)/);
  assert.match(md, /## Executive Brief/);
  assert.match(md, /## SEC EDGAR Filings & Financials/);
  assert.match(md, /## Execution & Cost Ledger/);
  assert.match(stderrBuf, /Saved dossier to/);
  assert.equal(stdoutBuf, "");
});

test("CLI --discover queries live https://helve.dev/v1/tools/search without an API key", async () => {
  let stdoutBuf = "";
  let stderrBuf = "";

  const code = await runCli(["--discover", "sec filings"], {
    stdout: { write: (s) => (stdoutBuf += s) },
    stderr: { write: (s) => (stderrBuf += s) },
    env: {},
  });

  assert.equal(code, 0);
  assert.match(stdoutBuf, /sec_edgar/i);
  assert.equal(stderrBuf, "");
});

test("renderMarkdown formats empty/partial reports cleanly without throwing", () => {
  const md = renderMarkdown({
    company: "ExampleCo",
    ticker: null,
    url: null,
    cik: null,
    generatedAt: "2026-11-20T12:00:00.000Z",
    results: {},
    synthesis: null,
    ledger: [],
    summary: { totalCalls: 0, succeeded: 0, failed: 0, budgetCapped: 0, totalCostUsd: 0, maxCostUsd: 0.25 },
  });
  assert.match(md, /# Company Research Dossier: ExampleCo/);
});
