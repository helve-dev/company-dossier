# company-dossier

**Generate a cited Markdown or JSON company & SEC research dossier from 8+ live data sources in one command — powered by a single API key and zero runtime dependencies.**

[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](#quick-start)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-blue)](#architecture)
[![npm](https://img.shields.io/npm/v/%40helve-dev%2Fcompany-dossier)](https://www.npmjs.com/package/@helve-dev/company-dossier)
[![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)](./LICENSE)

Instead of juggling separate accounts and SDKs for Exa, Firecrawl, Brave, SEC EDGAR, GitHub, Hacker News, and OpenRouter, `company-dossier` fans out in parallel through a single `HELVE_API_KEY`, prints an exact per-call USD cost ledger, enforces a budget cap (`--max-cost` + server-side `spend_limit_usd`), and guarantees **$0.00 charged on failed upstream calls**.

---

## Quick Start

### 1. Try it in one command (zero clone, no API key required)

```bash
# Run the offline demo and inspect the generated dossier + cost ledger
npx @helve-dev/company-dossier "NVIDIA" --ticker NVDA --cik 0001045810 --url https://www.nvidia.com --synthesize --demo

# Or query the live Helve tool catalog with zero auth
npx @helve-dev/company-dossier --discover "sec filings company research"
```

Or clone and run locally:

```bash
git clone https://github.com/helve-dev/company-dossier.git
cd company-dossier
node bin/dossier.mjs "NVIDIA" --ticker NVDA --cik 0001045810 --url https://www.nvidia.com --synthesize --demo
```

### 2. Run live research on any public or private company

Get a key at **[helve.dev](https://helve.dev)** (`$1.00` free starter credit, 0% per-call markup, no monthly subscription required):

```bash
export HELVE_API_KEY="sk_live_your_key_here"

# Private company (web fusion search, homepage extract, Exa Q&A, competitors, news, GitHub, HN + AI brief)
node bin/dossier.mjs "Stripe" --url https://stripe.com --synthesize --out stripe.md

# Public company (adds SEC EDGAR 10-K/10-Q/8-K filings, entity metadata & GAAP XBRL revenue history)
node bin/dossier.mjs "NVIDIA" --ticker NVDA --cik 0001045810 --url https://www.nvidia.com --synthesize --out nvda.md

# Machine-readable JSON for downstream agents or pipelines
node bin/dossier.mjs "Linear" --url https://linear.app --json --out linear.json
```

---

## Terminal Output Preview

```text
Researching "NVIDIA" [demo mode] across live sources...

Dossier complete: NVIDIA (NVDA)
  [OK  ] helve.web_search                 612ms    $0.0080
  [OK  ] exa.answer                       890ms    $0.0100
  [OK  ] sec_edgar.search_filings         245ms    $0.0000
  [OK  ] helve.web_extract                740ms    $0.0050
  [OK  ] exa.find_similar                 480ms    $0.0060
  [OK  ] brave.news_search                310ms    $0.0030
  [OK  ] github.search_repositories       220ms    $0.0000
  [OK  ] hackernews.search                165ms    $0.0000
  [OK  ] sec_edgar.company_submissions    190ms    $0.0000
  [OK  ] sec_edgar.xbrl_concept           210ms    $0.0000
  [OK  ] openrouter.chat                 1120ms    $0.0025
  -----------------------------------------------------------
  Total: 11/11 succeeded · Spend: $0.0345 (cap: $0.25)
Saved dossier to examples/nvidia-dossier.md
```

See the full generated Markdown report: **[`examples/nvidia-dossier.md`](./examples/nvidia-dossier.md)**.

---

## Architecture

```text
                        ┌──────────────────────────────────────────────┐
                        │       company-dossier (Node 18+ ESM)         │
                        │     0 runtime deps · parallel Promise.all    │
                        └──────────────────────┬───────────────────────┘
                                               │ 1 HELVE_API_KEY
                                               │ POST https://helve.dev/v1/tools/call
                                               ▼
┌───────────────────┬──────────────────┬───────────────────┬───────────────────┬──────────────────┐
│  Web & Overview   │  Competitors     │  SEC EDGAR        │  News & Signals   │  Synthesis       │
├───────────────────┼──────────────────┼───────────────────┼───────────────────┼──────────────────┤
│ helve.web_search  │ exa.find_similar │ search_filings    │ brave.news_search │ openrouter.chat  │
│ helve.web_extract │ exa.answer       │ company_subm.     │ github.search     │ (--synthesize)   │
│                   │                  │ xbrl_concept      │ hackernews.search │                  │
└───────────────────┴──────────────────┴───────────────────┴───────────────────┴──────────────────┘
                                               │
                                               ▼
                         Cited Markdown (.md) or JSON (.json) + USD Cost Ledger
```

### Data Sources Collected

| Source | Helve `tool_id` | Trigger | What it adds |
| :--- | :--- | :--- | :--- |
| Web Fusion Search | `helve.web_search` | Always | Multi-engine consensus overview & product pages |
| Cited Executive Q&A | `exa.answer` | Always | Direct business model summary with inline citations |
| SEC EDGAR Filings | `sec_edgar.search_filings` | Always | Recent 10-K, 10-Q, and 8-K filings |
| Homepage Extract | `helve.web_extract` | `--url` | Clean Markdown extract of homepage/product copy |
| Similar Competitors | `exa.find_similar` | `--url` | Semantically similar competitor domains |
| Recent News (30d) | `brave.news_search` | Default (`--no-news` to skip) | Past-month news coverage |
| GitHub Footprint | `github.search_repositories` | Default (`--no-community` to skip) | Top repositories, stars & primary languages |
| Hacker News Signal | `hackernews.search` | Default (`--no-community` to skip) | Developer discussions, points & comments |
| SEC Entity Metadata | `sec_edgar.company_submissions` | `--cik` | Official SIC, fiscal year end & incorporation state |
| SEC XBRL Revenues | `sec_edgar.xbrl_concept` | `--cik` | Structured US-GAAP revenue time series |
| Executive Synthesis | `openrouter.chat` | `--synthesize` | Tight 4-part analyst brief with inline source links |

---

## Deterministic Cost Control

Autonomous research scripts can easily burn through API budgets in a loop. `company-dossier` combines two safeguards:

1. **Client-side guard (`--max-cost`, default `$0.25`):** Tracks exact `usage.cost_usd` returned by each gateway call and skips optional synthesis if cumulative spend reaches your cap.
2. **Server-side cap (`402 spend_limit_exceeded`):** If your Helve API key has a `spend_limit_usd` budget cap set, `company-dossier` catches `HTTP 402` cleanly, marks the capped call as `$0.00`, and still writes the dossier with everything already gathered.
3. **Failed-call escrow:** Any upstream provider error (`5xx`/timeout) is recorded as `$0.00` and never aborts the rest of the run.

---

## CLI Options

```text
Usage:
  company-dossier <company> [options]
  company-dossier --discover [query]

Options:
  --url <https://...>     Company website (enables homepage extract + Exa similar competitors)
  --ticker <SYMBOL>       Stock ticker for SEC EDGAR filings (e.g. NVDA, MSFT, AAPL)
  --cik <CIK>             SEC Central Index Key (enables entity metadata + GAAP XBRL revenues)
  --synthesize, -s        Add an LLM executive brief via openrouter.chat (same HELVE_API_KEY)
  --model <slug>          OpenRouter model for --synthesize (default: openai/gpt-4o-mini)
  --max-cost <usd>        Client-side spend guard in USD (default: 0.25)
  --out, -o <path>        Write Markdown (or JSON with --json) report to file
  --json                  Output structured JSON instead of Markdown
  --no-news               Skip Brave News search
  --no-community          Skip GitHub & Hacker News signals
  --demo                  Run offline demo mode (no API key required)
  --discover [query]      Query live Helve tool catalog (no API key required)
  -h, --help              Show help
```

---

## Using from Claude Code, Cursor, or Codex (MCP)

Want your coding agent to run the same multi-provider research interactively inside Claude Code, Cursor, or Codex without leaving the editor? Connect the Helve MCP server (`https://helve.dev/mcp`) directly — see **[`helve-dev/helve-mcp`](https://github.com/helve-dev/helve-mcp)**.

## Development & Tests

```bash
npm test
```

Runs 7 unit, schema-validation, `402` budget-cap, `--demo` end-to-end, and live unauthenticated `--discover` tests using Node's built-in test runner (`node --test`).

## License

[MIT](./LICENSE)
