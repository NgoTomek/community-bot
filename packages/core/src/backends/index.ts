import type { BackendName } from "../schemas";
import type { Backend, BackendEnv } from "./types";

export * from "./types";

/** Creates the backend named by BACKEND (grokbot | openai | mock). */
export function createBackend(_name: BackendName, _env: BackendEnv = {}): Backend {
  throw new Error("createBackend: not implemented yet");
}
