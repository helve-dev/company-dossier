import { writeFileSync } from "node:fs";
import { HelveClient } from "./client.mjs";
import { createDemoClient } from "./demo.mjs";
import { runCollectors } from "./sources.mjs";
import { renderMarkdown, formatTerminalSummary } from "./render.mjs";

export function parseArgs(argv) {
  const opts = {
    company: "",
    url: "",
    ticker: "",
    cik: "",
    out: "",
    json: false,
    demo: false,
    discover: false,
    discoverQuery: "sec filings company research web search",
    synthesize: false,
    model: "openai/gpt-4o-mini",
    maxCostUsd: 0.25,
    includeNews: true,
    includeCommunity: true,
    help: false,
  };

  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      opts.help = true;
    } else if (a === "--demo") {
      opts.demo = true;
    } else if (a === "--json") {
      opts.json = true;
    } else if (a === "--synthesize" || a === "-s") {
      opts.synthesize = true;
    } else if (a === "--no-news") {
      opts.includeNews = false;
    } else if (a === "--no-community") {
      opts.includeCommunity = false;
    } else if (a === "--discover") {
      opts.discover = true;
      if (argv[i + 1] && !argv[i + 1].startsWith("-")) {
        opts.discoverQuery = argv[++i];
      }
    } else if (a === "--url" && argv[i + 1]) {
      opts.url = argv[++i];
    } else if (a === "--ticker" && argv[i + 1]) {
      opts.ticker = argv[++i];
    } else if (a === "--cik" && argv[i + 1]) {
      opts.cik = argv[++i];
    } else if ((a === "--out" || a === "-o") && argv[i + 1]) {
      opts.out = argv[++i];
    } else if (a === "--model" && argv[i + 1]) {
      opts.model = argv[++i];
    } else if (a === "--max-cost" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (Number.isFinite(parsed) && parsed >= 0) {
        opts.maxCostUsd = parsed;
      }
    } else if (!a.startsWith("-")) {
      positional.push(a);
    }
  }

  opts.company = positional.join(" ").trim();
  return opts;
}

export const HELP_TEXT = `company-dossier — Open-source Company & SEC Research CLI (1 API key, 8+ live sources)

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
  -h, --help              Show this help

Examples:
  # Try instantly with no API key:
  company-dossier "NVIDIA" --ticker NVDA --url https://www.nvidia.com --demo

  # Inspect live catalog tools & schemas with no API key:
  company-dossier --discover "sec filings and web extraction"

  # Run live research with one HELVE_API_KEY:
  export HELVE_API_KEY=sk_live_...
  company-dossier "Stripe" --url https://stripe.com --synthesize --out stripe.md
  company-dossier "NVIDIA" --ticker NVDA --cik 0001045810 --url https://www.nvidia.com --out nvda.md
`;

export async function runCli(argv, { stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  const opts = parseArgs(argv);

  if (opts.help || (!opts.discover && !opts.company)) {
    stdout.write(HELP_TEXT);
    return opts.help ? 0 : 1;
  }

  const baseUrl = env.HELVE_BASE_URL || "https://helve.dev";

  if (opts.discover) {
    const client = new HelveClient({ baseUrl });
    const res = await client.searchTools(opts.discoverQuery, { limit: 10 });
    const tools = res?.tools || res?.results || [];
    if (opts.json) {
      stdout.write(`${JSON.stringify(res, null, 2)}\n`);
      return 0;
    }
    stdout.write(`Live Helve catalog matches for "${opts.discoverQuery}" (${tools.length} shown):\n\n`);
    for (const t of tools) {
      const id = t.id || t.tool_id || "unknown";
      const desc = (t.description || "").replace(/\s+/g, " ").slice(0, 88);
      stdout.write(`  - ${id.padEnd(32)} ${desc}\n`);
    }
    stdout.write(`\nFull catalog: https://helve.dev/tools · MCP endpoint: https://helve.dev/mcp\n`);
    return 0;
  }

  const apiKey = env.HELVE_API_KEY || "";
  if (!opts.demo && !apiKey) {
    stderr.write(
      `Error: HELVE_API_KEY is not set.\n\n` +
        `  1. Try offline demo mode:   company-dossier "${opts.company}" --demo\n` +
        `  2. Browse live tools free:  company-dossier --discover\n` +
        `  3. Run live research:       Get a key at https://helve.dev ($1.00 free starter credit, 0% markup)\n` +
        `                              export HELVE_API_KEY=sk_live_...\n`
    );
    return 1;
  }

  const client = opts.demo
    ? createDemoClient({ company: opts.company, ticker: opts.ticker, url: opts.url || "https://www.nvidia.com" })
    : new HelveClient({ apiKey, baseUrl });

  stderr.write(
    `Researching "${opts.company}"${opts.demo ? " [demo mode]" : ""} across live sources...\n`
  );

  const report = await runCollectors(client, opts);
  const output = opts.json ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);

  if (opts.out) {
    writeFileSync(opts.out, output, "utf8");
    stderr.write(formatTerminalSummary(report));
    stderr.write(`Saved dossier to ${opts.out}\n`);
  } else {
    stdout.write(output);
    stderr.write(formatTerminalSummary(report));
  }

  return 0;
}
