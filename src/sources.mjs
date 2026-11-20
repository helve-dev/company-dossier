/**
 * Builds the exact schema-verified Helve tool call plan for a company research dossier.
 * Every payload matches live GET https://helve.dev/v1/tools JSON Schemas.
 */
export function buildToolPlan({ company, url = "", ticker = "", cik = "", includeNews = true, includeCommunity = true }) {
  const plan = [
    {
      key: "web_search",
      label: "Web Fusion Search",
      toolId: "helve.web_search",
      args: {
        query: `${company} company overview products pricing customers`,
        provider: "fusion",
        max_results: 6,
      },
    },
    {
      key: "exa_answer",
      label: "Cited Executive Q&A",
      toolId: "exa.answer",
      args: {
        query: `What does ${company} build, what is its business model and pricing, and what are its most notable recent product or business developments?`,
        text: true,
      },
    },
    {
      key: "sec_filings",
      label: "SEC EDGAR Filings",
      toolId: "sec_edgar.search_filings",
      args: {
        q: ticker ? `${company} ${ticker}` : company,
        forms: "10-K,10-Q,8-K",
        limit: 6,
      },
    },
  ];

  if (url) {
    plan.push(
      {
        key: "web_extract",
        label: "Homepage Extract",
        toolId: "helve.web_extract",
        args: {
          urls: [url],
          content: { max_chars: 6000, format: "markdown" },
        },
      },
      {
        key: "competitors",
        label: "Similar Competitors",
        toolId: "exa.find_similar",
        args: {
          url,
          num_results: 6,
          exclude_source_domain: true,
          include_text: false,
        },
      }
    );
  }

  if (includeNews) {
    plan.push({
      key: "news",
      label: "Recent News (30d)",
      toolId: "brave.news_search",
      args: {
        q: company,
        count: 6,
        freshness: "pm",
      },
    });
  }

  if (includeCommunity) {
    plan.push(
      {
        key: "github",
        label: "GitHub Repositories",
        toolId: "github.search_repositories",
        args: {
          q: company,
          sort: "stars",
          per_page: 5,
        },
      },
      {
        key: "hackernews",
        label: "Hacker News Signal",
        toolId: "hackernews.search",
        args: {
          query: company,
          tags: "story",
          hitsPerPage: 6,
        },
      }
    );
  }

  if (cik) {
    plan.push(
      {
        key: "sec_submissions",
        label: "SEC Entity Metadata",
        toolId: "sec_edgar.company_submissions",
        args: {
          cik: String(cik).trim(),
          limit: 10,
        },
      },
      {
        key: "sec_revenues",
        label: "SEC XBRL Revenues",
        toolId: "sec_edgar.xbrl_concept",
        args: {
          cik: String(cik).trim(),
          taxonomy: "us-gaap",
          tag: "Revenues",
          limit: 8,
        },
      }
    );
  }

  return plan;
}

/**
 * Runs all planned collectors in parallel with client-side + server-side budget enforcement.
 */
export async function runCollectors(client, options, { onResult = null } = {}) {
  const plan = buildToolPlan(options);
  const results = {};
  const ledger = [];
  let totalCostUsd = 0;
  let budgetCapped = false;

  const settled = await Promise.all(
    plan.map(async (step) => {
      const res = await client.callTool(step.toolId, step.args);
      const entry = {
        key: step.key,
        label: step.label,
        ...res,
      };
      if (typeof onResult === "function") {
        onResult(entry);
      }
      return entry;
    })
  );

  for (const entry of settled) {
    results[entry.key] = entry;
    ledger.push(entry);
    totalCostUsd += entry.costUsd;
    if (entry.status === "budget_capped") {
      budgetCapped = true;
    }
  }

  const maxCostUsd = Number(options.maxCostUsd ?? 0.25);
  let synthesis = null;

  if (options.synthesize) {
    if (budgetCapped || totalCostUsd >= maxCostUsd) {
      const skipped = {
        key: "synthesis",
        label: "Executive Synthesis",
        ok: false,
        toolId: "openrouter.chat",
        provider: "openrouter",
        latencyMs: 0,
        costUsd: 0,
        data: null,
        warnings: [],
        status: "budget_capped",
        error: {
          code: "client_max_cost_reached",
          status: 402,
          message: `Skipped synthesis because cumulative spend ($${totalCostUsd.toFixed(4)}) reached --max-cost ($${maxCostUsd.toFixed(2)}).`,
        },
      };
      ledger.push(skipped);
      if (typeof onResult === "function") onResult(skipped);
    } else {
      const digest = buildSynthesisDigest(options.company, results);
      const synthRes = await client.callTool("openrouter.chat", {
        model: options.model || "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a concise equity & market research analyst. Write a tight, factual 4-part executive brief (Positioning, Traction & Financials, Competitive Landscape, Risks & Open Questions) using ONLY the supplied tool outputs. Cite URLs inline in Markdown. Never invent numbers.",
          },
          {
            role: "user",
            content: digest,
          },
        ],
        max_tokens: 1000,
        temperature: 0.2,
      });
      const entry = {
        key: "synthesis",
        label: "Executive Synthesis",
        ...synthRes,
      };
      ledger.push(entry);
      totalCostUsd += entry.costUsd;
      if (entry.status === "budget_capped") budgetCapped = true;
      if (entry.ok) {
        synthesis = extractChatText(entry.data);
      }
      if (typeof onResult === "function") onResult(entry);
    }
  }

  return {
    company: options.company,
    ticker: options.ticker || null,
    url: options.url || null,
    cik: options.cik || null,
    generatedAt: new Date().toISOString(),
    results,
    synthesis,
    ledger,
    summary: {
      totalCalls: ledger.length,
      succeeded: ledger.filter((x) => x.ok).length,
      failed: ledger.filter((x) => x.status === "failed").length,
      budgetCapped: ledger.filter((x) => x.status === "budget_capped").length,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      maxCostUsd,
    },
  };
}

export function extractChatText(data) {
  if (!data) return null;
  if (typeof data === "string") return data;
  if (typeof data.content === "string") return data.content;
  if (typeof data.text === "string") return data.text;
  const choice = data?.choices?.[0];
  if (choice?.message?.content) return choice.message.content;
  return null;
}

function buildSynthesisDigest(company, results) {
  const parts = [`Target company: ${company}`];
  for (const [key, res] of Object.entries(results)) {
    if (!res?.ok || !res.data) continue;
    const snippet = JSON.stringify(res.data).slice(0, 2200);
    parts.push(`## ${key} (${res.toolId})\n${snippet}`);
  }
  return parts.join("\n\n");
}
