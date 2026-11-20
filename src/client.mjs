const DEFAULT_BASE_URL = "https://helve.dev";

export class HelveError extends Error {
  constructor(message, { status = 0, code = "unknown", details = null } = {}) {
    super(message);
    this.name = "HelveError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class HelveClient {
  constructor({ apiKey = "", baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch, timeoutMs = 45000 } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async _request(path, { method = "GET", body = null, auth = true } = {}) {
    const headers = {
      Accept: "application/json",
    };
    if (body !== null) {
      headers["Content-Type"] = "application/json";
    }
    if (auth) {
      if (!this.apiKey) {
        throw new HelveError("HELVE_API_KEY is not set. Run with --demo or set HELVE_API_KEY.", {
          status: 401,
          code: "missing_api_key",
        });
      }
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await res.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = { raw: text };
      }

      if (!res.ok) {
        const errCode =
          payload?.error?.code ||
          payload?.code ||
          (res.status === 402 ? "spend_limit_exceeded" : `http_${res.status}`);
        const errMsg =
          payload?.error?.message ||
          payload?.message ||
          `HTTP ${res.status} from ${path}`;
        throw new HelveError(errMsg, {
          status: res.status,
          code: errCode,
          details: payload,
        });
      }

      return payload;
    } catch (err) {
      if (err instanceof HelveError) throw err;
      if (err?.name === "AbortError") {
        throw new HelveError(`Request to ${path} timed out after ${this.timeoutMs}ms`, {
          status: 504,
          code: "timeout",
        });
      }
      throw new HelveError(err?.message || "Network error", {
        status: 0,
        code: "network_error",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Unauthenticated catalog search (no API key required).
   */
  async searchTools(query, { limit = 10 } = {}) {
    return this._request("/v1/tools/search", {
      method: "POST",
      body: { query, limit },
      auth: false,
    });
  }

  /**
   * Account credit balance & API key spend_limit_usd status.
   */
  async getBalance() {
    return this._request("/v1/balance", { method: "GET", auth: true });
  }

  /**
   * Invoke any tool in Helve's catalog by tool_id.
   * Failed calls debit $0.00 under Helve's escrow guarantee.
   */
  async callTool(toolId, args = {}) {
    const started = Date.now();
    try {
      const res = await this._request("/v1/tools/call", {
        method: "POST",
        body: { tool_id: toolId, arguments: args },
        auth: true,
      });
      const costUsd = Number(res?.usage?.cost_usd ?? 0);
      return {
        ok: true,
        toolId,
        provider: res?.provider || toolId.split(".")[0],
        latencyMs: Number(res?.latency_ms ?? Date.now() - started),
        costUsd: Number.isFinite(costUsd) ? costUsd : 0,
        data: res?.data ?? null,
        warnings: Array.isArray(res?.warnings) ? res.warnings : [],
        status: "ok",
        error: null,
      };
    } catch (err) {
      const isBudgetCap = err instanceof HelveError && err.status === 402;
      return {
        ok: false,
        toolId,
        provider: toolId.split(".")[0],
        latencyMs: Date.now() - started,
        costUsd: 0, // $0 failed-call escrow
        data: null,
        warnings: [],
        status: isBudgetCap ? "budget_capped" : "failed",
        error: {
          code: err?.code || "error",
          status: err?.status || 0,
          message: err?.message || String(err),
        },
      };
    }
  }
}
