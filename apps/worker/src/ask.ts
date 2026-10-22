import type { Backend } from "@community-bots/core/backends";
import { extractJson, formatZodError } from "@community-bots/core";
import type { z } from "zod";

type Schema<T> = z.ZodType<T> | ((value: unknown) => T);

function isZod<T>(schema: Schema<T>): schema is z.ZodType<T> {
  return typeof schema === "object" && schema !== null && "safeParse" in schema;
}

function validate<T>(schema: Schema<T>, value: unknown): T {
  if (isZod(schema)) {
    const result = schema.safeParse(value);
    if (!result.success) throw new Error(formatZodError(result.error));
    return result.data;
  }
  return schema(value);
}

/** Ask a Bot for JSON and validate it, retrying with the error fed back. */
export async function askValidated<T>(opts: {
  backend: Backend;
  bot: string;
  standingRules?: string;
  prompt: string;
  schema: Schema<T>;
  /** Extra attempts after the first. Default 2. */
  retries?: number;
}): Promise<T> {
  const retries = opts.retries ?? 2;
  let lastError = "unknown error";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const prompt =
      attempt === 0
        ? opts.prompt
        : `${opts.prompt}\n\nYour previous reply could not be used: ${lastError}. Reply with JSON only.`;
    const raw = await opts.backend.ask({ bot: opts.bot, standingRules: opts.standingRules, prompt });
    try {
      return validate(opts.schema, extractJson(raw));
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`Bot ${opts.bot} did not return usable JSON after ${retries} retries: ${lastError}`);
}
