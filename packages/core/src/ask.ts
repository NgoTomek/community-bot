import type { z } from "zod";
import type { Backend } from "./backends/types";
import { extractJson } from "./json";
import { formatZodError } from "./schemas";

export type AskValidator<T> = z.ZodType<T> | ((value: unknown) => T);

export interface AskJsonInput<T> {
  backend: Backend;
  bot: string;
  standingRules?: string;
  prompt: string;
  schema: AskValidator<T>;
  /** Extra attempts after the first. Default 2 (3 tries total). */
  retries?: number;
}

function isZodSchema<T>(schema: AskValidator<T>): schema is z.ZodType<T> {
  return typeof schema === "object" && schema !== null && "safeParse" in schema;
}

function validate<T>(schema: AskValidator<T>, value: unknown): T {
  if (isZodSchema(schema)) {
    const result = schema.safeParse(value);
    if (!result.success) throw new Error(formatZodError(result.error));
    return result.data;
  }
  return schema(value);
}

/**
 * Ask a Bot, extract JSON, and validate. On extract/validate failure, re-asks with
 * the original prompt plus the error, up to `retries` extra times.
 */
export async function askJson<T>(input: AskJsonInput<T>): Promise<T> {
  const retries = input.retries ?? 2;
  let lastError = "unknown error";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const prompt =
      attempt === 0
        ? input.prompt
        : `${input.prompt}\n\nYour previous reply could not be used: ${lastError}. Reply with JSON only.`;
    const raw = await input.backend.ask({
      bot: input.bot,
      standingRules: input.standingRules,
      prompt,
    });
    try {
      const parsed = extractJson(raw);
      return validate(input.schema, parsed);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`Bot ${input.bot} did not return usable JSON after ${retries} retries: ${lastError}`);
}
