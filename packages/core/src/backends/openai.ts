import { BackendError, turnTimeoutMs, type AskRequest, type Backend, type BackendEnv } from "./types";

/** OpenAI-compatible chat completions. Cannot browse; the worker fetches pages for the Scout. */
export class OpenAiBackend implements Backend {
  readonly name = "openai" as const;
  readonly canBrowse = false;

  constructor(private readonly env: BackendEnv = {}) {}

  async ask(request: AskRequest): Promise<string> {
    const key = this.env.LLM_API_KEY?.trim();
    if (!key) {
      throw new BackendError("LLM_API_KEY is not set. The openai backend cannot call the model without an API key.");
    }
    const base = this.env.LLM_BASE_URL?.trim().replace(/\/+$/, "");
    if (!base) throw new BackendError("LLM_BASE_URL is not set.");
    const model = this.env.LLM_MODEL?.trim();
    if (!model) throw new BackendError("LLM_MODEL is not set.");

    const timeout = turnTimeoutMs(this.env);
    const messages = [
      ...(request.standingRules != null ? [{ role: "system", content: request.standingRules }] : []),
      { role: "user", content: request.prompt },
    ];

    let response: Response;
    try {
      response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages }),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      if (isAbort(error)) throw new BackendError(`LLM request timed out after ${timeout}ms.`);
      throw new BackendError("LLM request failed.");
    }

    if (!response.ok) {
      await response.text().catch(() => "");
      throw new BackendError(`LLM request failed (HTTP ${response.status}).`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new BackendError("LLM response was not JSON.");
    }
    const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new BackendError("LLM response did not include a message.");
    }
    return content;
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
