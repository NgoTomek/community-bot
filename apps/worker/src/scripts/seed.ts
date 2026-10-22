import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BackendNameSchema, slugify } from "@community-bots/core";
import { createBackend, type BackendEnv } from "@community-bots/core/backends";
import { createServiceClient } from "../db";
import { readableError } from "../errors";
import { repoRoot, requireServiceRole } from "../env";
import { draftCommunity } from "../handlers";

type SeedEntry = { name: string; sourceUrls: string[] };

function loadSeedFile(): SeedEntry[] {
  const raw: unknown = JSON.parse(readFileSync(join(repoRoot, "seed/communities.json"), "utf8"));
  if (!Array.isArray(raw)) throw new Error("seed/communities.json must be an array of {name, sourceUrls}");
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`seed/communities.json[${index}] must be an object`);
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== "string" || !record.name.trim()) {
      throw new Error(`seed/communities.json[${index}] needs a name`);
    }
    if (!Array.isArray(record.sourceUrls) || record.sourceUrls.some((url) => typeof url !== "string")) {
      throw new Error(`seed/communities.json[${index}] needs sourceUrls: string[]`);
    }
    return { name: record.name.trim(), sourceUrls: record.sourceUrls };
  });
}

const { url, key } = requireServiceRole();
const backendName = BackendNameSchema.safeParse(process.env.BACKEND?.trim() || "mock");
if (!backendName.success) {
  console.error("BACKEND must be grokbot, openai, or mock");
  process.exit(1);
}

let backend;
try {
  backend = createBackend(backendName.data, process.env as BackendEnv);
} catch (error) {
  console.error(readableError(error));
  console.error("Run the worker with BACKEND=mock.");
  process.exit(0);
}

const client = createServiceClient(url, key);
let failed = 0;

for (const entry of loadSeedFile()) {
  const id = slugify(entry.name);
  const existing = await client.from("communities").select("id").eq("id", id).maybeSingle();
  if (existing.error) {
    console.error(`${id}: ${readableError(new Error(existing.error.message))}`);
    failed += 1;
    continue;
  }
  if (existing.data) {
    console.log(id);
    continue;
  }
  const source = entry.sourceUrls[0];
  if (!source) {
    console.error(`${id}: no sourceUrls`);
    failed += 1;
    continue;
  }
  try {
    const card = await draftCommunity({
      client,
      backend,
      url: source,
      name: entry.name,
      scrape: false,
      onProgress: async (text) => {
        console.log(`${id}: ${text}`);
      },
    });
    console.log(card.id);
  } catch (error) {
    const message = readableError(error);
    console.error(`${id}: ${message}`);
    if (/not implemented/i.test(message)) {
      console.error("Run the worker with BACKEND=mock.");
      process.exit(0);
    }
    failed += 1;
  }
}

if (failed) process.exit(1);
