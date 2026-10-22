import { GrokBotBackend } from "./grokbot";
import { MockBackend } from "./mock";
import { OpenAiBackend } from "./openai";
import type { Backend, BackendEnv } from "./types";

export * from "./types";
export { GrokBotBackend } from "./grokbot";
export { MockBackend } from "./mock";
export { OpenAiBackend } from "./openai";

/** Creates the backend named by BACKEND (grokbot | openai | mock). Unknown names throw. */
export function createBackend(name: string, env: BackendEnv = {}): Backend {
  switch (name) {
    case "mock":
      return new MockBackend();
    case "openai":
      return new OpenAiBackend(env);
    case "grokbot":
      return new GrokBotBackend(env);
    default:
      throw new Error(`Unknown backend "${name}". Expected grokbot, openai, or mock.`);
  }
}
