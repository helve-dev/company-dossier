/**
 * Offline demo client so anyone can run `company-dossier "NVIDIA" --demo`
 * in <100ms without an API key and inspect the exact output & cost ledger.
 */
export function createDemoClient({ company = "NVIDIA", ticker = "NVDA", url = "https://www.nvidia.com" } = {}) {
  const fixtures = {
    "helve.web_search": {
      provider: "fusion",
      latencyMs: 612,
      costUsd: 0.008,
      data: {
        results: [
          {
            title: `${company} — Accelerated Computing & AI Infrastructure`,
            url,
            snippet:
              "Full-stack accelerated computing platform spanning Blackwell/Hopper data center GPUs, CUDA software, InfiniBand/Spectrum-X networking, and NIM microservices.",
          },
          {
            title: `${company} Investor Relations & Quarterly Results`,
            url: "https://investor.nvidia.com",
            snippet:
              "Data Center revenue leads growth across hyperscale cloud providers, sovereign AI initiatives, and enterprise inference deployments.",
          },
        ],
      },
    },
    "helve.web_extract": {
      provider: "firecrawl",
      latencyMs: 740,
      costUsd: 0.005,
      data: {
        results: [
          {
            url,
            markdown:
              "NVIDIA pioneers accelerated computing to tackle challenges no one else can solve. Core platforms include Blackwell architecture for trillion-parameter AI training and inference, CUDA-X libraries, Omniverse industrial digital twins, and DRIVE autonomous vehicle compute.",
          },
        ],
      },
    },
    "exa.answer": {
      provider: "exa",
      latencyMs: 890,
      costUsd: 0.01,
      data: {
        answer:
          "NVIDIA designs full-stack accelerated computing platforms combining data center GPUs (Hopper, Blackwell), high-speed networking (NVLink, InfiniBand, Spectrum-X), and proprietary software (CUDA, TensorRT, NIM). Its primary revenue engine is the Data Center segment serving hyperscalers, AI labs, and enterprises, supplemented by Gaming, Professional Visualization, and Automotive.",
        citations: [
          { title: "NVIDIA Annual Report (Form 10-K)", url: "https://www.sec.gov/edgar/browse/?CIK=0001045810" },
          { title: "NVIDIA Data Center Platform", url: "https://www.nvidia.com/en-us/data-center/" },
        ],
      },
    },
    "exa.find_similar": {
      provider: "exa",
      latencyMs: 480,
      costUsd: 0.006,
      data: {
        results: [
          { title: "AMD Instinct Data Center Accelerators", url: "https://www.amd.com/en/products/accelerators/instinct.html", snippet: "ROCm open software ecosystem and MI300/MI325 series GPUs for AI training and inference." },
          { title: "Intel Gaudi AI Accelerators", url: "https://www.intel.com/content/www/us/en/products/details/processors/ai-accelerators/gaudi.html", snippet: "Enterprise AI training and inference accelerators." },
          { title: "Cerebras Systems Wafer-Scale Engine", url: "https://www.cerebras.ai", snippet: "Wafer-scale compute systems for ultra-fast LLM inference and training." },
          { title: "Groq LPU Inference Engine", url: "https://groq.com", snippet: "Deterministic low-latency Language Processing Units for real-time AI inference." },
        ],
      },
    },
    "brave.news_search": {
      provider: "brave",
      latencyMs: 310,
      costUsd: 0.003,
      data: {
        results: [
          {
            title: "Hyperscalers expand Blackwell rack-scale deployments for reasoning workloads",
            url: "https://nvidianews.nvidia.com",
            age: "4 days ago",
            description: "Cloud providers report strong demand for GB200/GB300 NVL72 systems for long-context inference.",
          },
          {
            title: "Enterprise NIM adoption accelerates across regulated financial & healthcare teams",
            url: "https://blogs.nvidia.com",
            age: "11 days ago",
            description: "Containerized inference microservices simplify on-prem and VPC model deployment.",
          },
        ],
      },
    },
    "sec_edgar.search_filings": {
      provider: "sec_edgar",
      latencyMs: 245,
      costUsd: 0.0,
      data: {
        filings: [
          { form: "10-K", filed_at: "2026-02-26", entity_name: "NVIDIA CORP", url: "https://www.sec.gov/edgar/browse/?CIK=0001045810" },
          { form: "10-Q", filed_at: "2026-08-27", entity_name: "NVIDIA CORP", url: "https://www.sec.gov/edgar/browse/?CIK=0001045810" },
          { form: "8-K", filed_at: "2026-11-18", entity_name: "NVIDIA CORP", url: "https://www.sec.gov/edgar/browse/?CIK=0001045810" },
        ],
      },
    },
    "sec_edgar.company_submissions": {
      provider: "sec_edgar",
      latencyMs: 190,
      costUsd: 0.0,
      data: {
        name: "NVIDIA CORP",
        sicDescription: "SEMICONDUCTORS & RELATED DEVICES",
        fiscalYearEnd: "0126",
        stateOfIncorporation: "DE",
      },
    },
    "sec_edgar.xbrl_concept": {
      provider: "sec_edgar",
      latencyMs: 210,
      costUsd: 0.0,
      data: {
        observations: [
          { end: "2026-01-25", form: "10-K", val: 130497000000 },
          { end: "2025-01-26", form: "10-K", val: 60922000000 },
          { end: "2024-01-28", form: "10-K", val: 26974000000 },
        ],
      },
    },
    "github.search_repositories": {
      provider: "github",
      latencyMs: 220,
      costUsd: 0.0,
      data: {
        items: [
          { full_name: "NVIDIA/TensorRT-LLM", html_url: "https://github.com/NVIDIA/TensorRT-LLM", stargazers_count: 11200, language: "C++", description: "TensorRT-LLM provides an easy-to-use Python API to define and optimize LLMs." },
          { full_name: "NVIDIA/Megatron-LM", html_url: "https://github.com/NVIDIA/Megatron-LM", stargazers_count: 13800, language: "Python", description: "Ongoing research training transformer models at scale." },
          { full_name: "NVIDIA/NeMo", html_url: "https://github.com/NVIDIA/NeMo", stargazers_count: 15100, language: "Python", description: "Scalable generative AI framework for researchers and developers." },
        ],
      },
    },
    "hackernews.search": {
      provider: "hackernews",
      latencyMs: 165,
      costUsd: 0.0,
      data: {
        hits: [
          { title: "Understanding NVLink and rack-scale GPU interconnects", objectID: "42100123", points: 342, num_comments: 148 },
          { title: "CUDA moat vs open kernel compilers (Triton, CUTLASS, Mojo)", objectID: "42088410", points: 289, num_comments: 214 },
        ],
      },
    },
    "openrouter.chat": {
      provider: "openrouter",
      latencyMs: 1120,
      costUsd: 0.0025,
      data: {
        choices: [
          {
            message: {
              content:
                "**Positioning:** NVIDIA owns the full-stack AI compute layer—combining Blackwell/Hopper GPUs, NVLink/Spectrum-X interconnects, and the CUDA/TensorRT-LLM software stack.\n\n**Traction & Financials:** SEC EDGAR filings confirm rapid Data Center scaling driven by hyperscaler rack-scale inference and training demand.\n\n**Competitive Landscape:** Primary merchant competitors include AMD Instinct (ROCm) and custom hyperscaler ASICs, alongside specialized inference chips (Cerebras, Groq).\n\n**Key Watch Items:** Hyperscaler capex durability, supply chain packaging capacity, and export-control exposure.",
            },
          },
        ],
      },
    },
  };

  return {
    async callTool(toolId) {
      const f = fixtures[toolId];
      if (!f) {
        return {
          ok: false,
          toolId,
          provider: toolId.split(".")[0],
          latencyMs: 10,
          costUsd: 0,
          data: null,
          warnings: [],
          status: "failed",
          error: { code: "demo_missing", status: 404, message: `No demo fixture for ${toolId}` },
        };
      }
      return {
        ok: true,
        toolId,
        provider: f.provider,
        latencyMs: f.latencyMs,
        costUsd: f.costUsd,
        data: f.data,
        warnings: [],
        status: "ok",
        error: null,
      };
    },
  };
}
