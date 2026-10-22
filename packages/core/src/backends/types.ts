import type { BackendName } from "../schemas";

export interface AskRequest {
  /** Bot name, e.g. "cb-unicorn-mafia", "cb-scout", "cb-matchmaker", "cb-scribe". */
  bot: string;
  /** The Bot's standing rules. grokbot stores them on the Bot; openai/mock send them as the system message. */
  standingRules?: string;
  prompt: string;
}

/** One interface for every brain the Bots can use. */
export interface Backend {
  readonly name: BackendName;
  /** True when the backend can open web pages itself (grokbot). Otherwise the worker fetches pages for the Scout. */
  readonly canBrowse: boolean;
  ask(request: AskRequest): Promise<string>;
}

/** Environment the backends read (see .env.example). */
export interface BackendEnv {
  GROKBOT_SKILL_PATH?: string;
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  TURN_TIMEOUT_MS?: string | number;
}

/** A public page fetched by the worker for backends that cannot browse. */
export interface FetchedPage {
  url: string;
  title: string | null;
  text: string;
}

export class BackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendError";
  }
}

/** One Bot turn, in milliseconds. Defaults to 120000. */
export function turnTimeoutMs(env: BackendEnv = {}): number {
  const raw = env.TURN_TIMEOUT_MS;
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return 120_000;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 120_000;
  return Math.floor(n);
}
