import { BackendNameSchema } from "@community-bots/core";
import { createBackend, type BackendEnv } from "@community-bots/core/backends";
import { createServiceClient } from "./db";
import { readableError } from "./errors";
import { requireServiceRole } from "./env";
import { startHeartbeat, type HeartbeatClient } from "./heartbeat";
import { startLoops } from "./loop";

const { url, key } = requireServiceRole();
const backendRaw = process.env.BACKEND?.trim() || "mock";
const backendName = BackendNameSchema.safeParse(backendRaw);
if (!backendName.success) {
  console.error(`BACKEND must be grokbot, openai, or mock (got ${JSON.stringify(backendRaw)})`);
  process.exit(1);
}

try {
  const backend = createBackend(backendName.data, process.env as BackendEnv);
  const client = createServiceClient(url, key);
  console.log(`${backend.name}: waiting for jobs`);
  startHeartbeat(client as unknown as HeartbeatClient, backend.name);
  startLoops({ client, backend });
} catch (error) {
  console.error(readableError(error));
  process.exit(1);
}
