function arr(val) {
  return Array.isArray(val) ? val : [];
}

function formatUsd(n) {
  return `$${Number(n || 0).toFixed(4)}`;
}

function pickList(data, keys) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  for (const k of keys) {
    if (Array.isArray(data[k])) return data[k];
  }
  return [];
}

function cleanSnippet(str, max = 220) {
  if (!str) return "";
  const flat = String(str).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function renderMarkdown(report) {
  const lines = [];
  const titleBits = [report.company];
  if (report.ticker) titleBits.push(`(${report.ticker.toUpperCase()})`);

  lines.push(`# Company Research Dossier: ${titleBits.join(" ")}`);
  lines.push("");
  lines.push(
    `> Generated ${report.generatedAt.slice(0, 19).replace("T", " ")} UTC via [company-dossier](https://github.com/helve-dev/company-dossier) · ` +
      `${report.summary.succeeded}/${report.summary.totalCalls} sources succeeded · ` +
      `Total gateway cost: **${formatUsd(report.summary.totalCostUsd)}**`
  );
  if (report.url || report.cik) {
    const meta = [];
    if (report.url) meta.push(`Website: ${report.url}`);
    if (report.ticker) meta.push(`Ticker: \`${report.ticker.toUpperCase()}\``);
    if (report.cik) meta.push(`SEC CIK: \`${report.cik}\``);
    lines.push(`> ${meta.join(" · ")}`);
  }
  lines.push("");

  // Optional AI Executive Brief
  if (report.synthesis) {
    lines.push("## Executive Brief");
    lines.push("");
    lines.push(report.synthesis.trim());
    lines.push("");
  }

  // Cited Executive Q&A (Exa Answer)
  const exaAns = report.results.exa_answer;
  if (exaAns?.ok && exaAns.data) {
    const answerText = exaAns.data.answer || exaAns.data.text || "";
    const citations = pickList(exaAns.data, ["citations", "results", "sources"]);
    if (answerText) {
      lines.push("## Overview & Business Model (Cited)");
      lines.push("");
      lines.push(String(answerText).trim());
      lines.push("");
    }
    if (citations.length > 0) {
      lines.push("**Key Citations:**");
      for (const c of citations.slice(0, 6)) {
        const title = c.title || c.url || "Source";
        const url = c.url || "";
        lines.push(url ? `- [${title}](${url})` : `- ${title}`);
      }
      lines.push("");
    }
  }

  // Homepage Extract
  const extract = report.results.web_extract;
  if (extract?.ok && extract.data) {
    const pages = pickList(extract.data, ["results", "pages"]);
    const first = pages[0] || extract.data;
    const content = first?.content || first?.markdown || first?.text || "";
    if (content) {
      lines.push("## Product & Homepage Extract");
      lines.push("");
      lines.push(cleanSnippet(content, 1200));
      lines.push("");
    }
  }

  // SEC EDGAR Filings & XBRL Financials
  const secFilings = report.results.sec_filings;
  const secSubs = report.results.sec_submissions;
  const secRev = report.results.sec_revenues;
  if (secFilings?.ok || secSubs?.ok || secRev?.ok) {
    lines.push("## SEC EDGAR Filings & Financials");
    lines.push("");
    if (secSubs?.ok && secSubs.data) {
      const d = secSubs.data;
      const facts = [];
      if (d.name) facts.push(`**Entity:** ${d.name}`);
      if (d.sicDescription || d.sic) facts.push(`**SIC:** ${d.sicDescription || d.sic}`);
      if (d.fiscalYearEnd) facts.push(`**Fiscal Year End:** ${d.fiscalYearEnd}`);
      if (d.stateOfIncorporation) facts.push(`**State:** ${d.stateOfIncorporation}`);
      if (facts.length) {
        lines.push(facts.join(" · "));
        lines.push("");
      }
    }

    const filings = pickList(secFilings?.data, ["filings", "hits", "results"]);
    if (filings.length > 0) {
      lines.push("| Form | Filed | Entity / Description | Link |");
      lines.push("| :--- | :--- | :--- | :--- |");
      for (const f of filings.slice(0, 6)) {
        const form = f.form || f.form_type || "—";
        const filed = f.filed_at || f.filingDate || f.date || "—";
        const desc = cleanSnippet(f.entity_name || f.company || f.description || report.company, 60);
        const link = f.url || f.filing_url ? `[EDGAR](${f.url || f.filing_url})` : "—";
        lines.push(`| \`${form}\` | ${filed} | ${desc} | ${link} |`);
      }
      lines.push("");
    } else if (secFilings?.ok) {
      lines.push("_No matching public SEC filings returned (company may be private or non-US)._");
      lines.push("");
    }

    const revObs = pickList(secRev?.data, ["observations", "values", "results"]);
    if (revObs.length > 0) {
      lines.push("### Reported GAAP Revenues (XBRL)");
      lines.push("");
      lines.push("| Period End | Form | Value (USD) |");
      lines.push("| :--- | :--- | ---: |");
      for (const obs of revObs.slice(0, 6)) {
        const val = typeof obs.val === "number" ? `$${(obs.val / 1e9).toFixed(2)}B` : String(obs.val ?? "—");
        lines.push(`| ${obs.end || obs.filed || "—"} | ${obs.form || "—"} | ${val} |`);
      }
      lines.push("");
    }
  }

  // Competitors (Exa Find Similar)
  const comps = report.results.competitors;
  if (comps?.ok && comps.data) {
    const items = pickList(comps.data, ["results", "similar", "items"]);
    if (items.length > 0) {
      lines.push("## Competitive Landscape (Semantically Similar)");
      lines.push("");
      for (const item of items.slice(0, 6)) {
        const title = item.title || item.url || "Competitor";
        const url = item.url || "";
        const desc = item.snippet || item.text ? ` — ${cleanSnippet(item.snippet || item.text, 140)}` : "";
        lines.push(url ? `- [${title}](${url})${desc}` : `- ${title}${desc}`);
      }
      lines.push("");
    }
  }

  // Recent News (Brave News Search)
  const news = report.results.news;
  if (news?.ok && news.data) {
    const articles = pickList(news.data, ["results", "articles", "news"]);
    if (articles.length > 0) {
      lines.push("## Recent News (Past 30 Days)");
      lines.push("");
      for (const a of articles.slice(0, 6)) {
        const title = a.title || "Article";
        const url = a.url || "";
        const age = a.age || a.published_at || a.date ? ` (${a.age || a.published_at || a.date})` : "";
        const desc = a.description || a.snippet ? ` — ${cleanSnippet(a.description || a.snippet, 150)}` : "";
        lines.push(url ? `- [${title}](${url})${age}${desc}` : `- ${title}${age}${desc}`);
      }
      lines.push("");
    }
  }

  // Web Fusion Search
  const web = report.results.web_search;
  if (web?.ok && web.data) {
    const items = pickList(web.data, ["results", "items"]);
    if (items.length > 0) {
      lines.push("## Web Fusion Search Highlights");
      lines.push("");
      for (const r of items.slice(0, 6)) {
        const title = r.title || r.url || "Result";
        const url = r.url || "";
        const snippet = r.snippet || r.content ? ` — ${cleanSnippet(r.snippet || r.content, 160)}` : "";
        lines.push(url ? `- [${title}](${url})${snippet}` : `- ${title}${snippet}`);
      }
      lines.push("");
    }
  }

  // Engineering & Community Signal (GitHub + HN)
  const gh = report.results.github;
  const hn = report.results.hackernews;
  if (gh?.ok || hn?.ok) {
    lines.push("## Developer & Engineering Footprint");
    lines.push("");
    const repos = pickList(gh?.data, ["items", "repositories", "results"]);
    if (repos.length > 0) {
      lines.push("### Top GitHub Repositories");
      lines.push("");
      lines.push("| Repository | Stars | Language | Description |");
      lines.push("| :--- | ---: | :--- | :--- |");
      for (const r of repos.slice(0, 5)) {
        const name = r.full_name || r.name || "repo";
        const url = r.html_url || r.url || "";
        const stars = r.stargazers_count ?? r.stars ?? "—";
        const lang = r.language || "—";
        const desc = cleanSnippet(r.description || "", 80);
        lines.push(`| ${url ? `[${name}](${url})` : name} | ${stars} | ${lang} | ${desc} |`);
      }
      lines.push("");
    }

    const stories = pickList(hn?.data, ["hits", "results", "stories"]);
    if (stories.length > 0) {
      lines.push("### Hacker News Discussions");
      lines.push("");
      for (const s of stories.slice(0, 5)) {
        const title = s.title || "HN Discussion";
        const url = s.url || (s.objectID ? `https://news.ycombinator.com/item?id=${s.objectID}` : "");
        const pts = s.points != null ? `${s.points} pts` : "";
        const cmts = s.num_comments != null ? `${s.num_comments} comments` : "";
        const meta = [pts, cmts].filter(Boolean).join(", ");
        lines.push(`- ${url ? `[${title}](${url})` : title}${meta ? ` (${meta})` : ""}`);
      }
      lines.push("");
    }
  }

  // Transparent Per-Call Cost Ledger
  lines.push("## Execution & Cost Ledger");
  lines.push("");
  lines.push("| Source | Tool ID | Status | Latency | Cost (USD) |");
  lines.push("| :--- | :--- | :--- | ---: | ---: |");
  for (const row of arr(report.ledger)) {
    const statusLabel =
      row.status === "ok"
        ? "ok"
        : row.status === "budget_capped"
        ? "budget_capped ($0)"
        : `failed ($0: ${row.error?.code || "err"})`;
    lines.push(
      `| ${row.label} | \`${row.toolId}\` | ${statusLabel} | ${row.latencyMs}ms | ${formatUsd(row.costUsd)} |`
    );
  }
  lines.push(`| **Total** | | **${report.summary.succeeded}/${report.summary.totalCalls} ok** | | **${formatUsd(report.summary.totalCostUsd)}** |`);
  lines.push("");

  return lines.join("\n");
}

export function formatTerminalSummary(report) {
  const rows = report.ledger.map((r) => {
    const badge = r.ok ? "OK  " : r.status === "budget_capped" ? "CAP " : "FAIL";
    const tool = r.toolId.padEnd(30);
    const ms = `${r.latencyMs}ms`.padStart(7);
    const cost = formatUsd(r.costUsd).padStart(9);
    return `  [${badge}] ${tool} ${ms}  ${cost}`;
  });
  return [
    "",
    `Dossier complete: ${report.company}${report.ticker ? ` (${report.ticker.toUpperCase()})` : ""}`,
    ...rows,
    `  -----------------------------------------------------------`,
    `  Total: ${report.summary.succeeded}/${report.summary.totalCalls} succeeded · Spend: ${formatUsd(report.summary.totalCostUsd)} (cap: $${Number(report.summary.maxCostUsd).toFixed(2)})`,
    "",
  ].join("\n");
}
