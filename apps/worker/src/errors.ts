import { formatZodError } from "@community-bots/core";

const SECRET_ENV = ["SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_ANON_KEY", "LLM_API_KEY", "LUMA_API_KEY"] as const;

function redact(message: string): string {
  let out = message;
  for (const name of SECRET_ENV) {
    const value = process.env[name]?.trim();
    if (value && value.length >= 8) out = out.split(value).join("[redacted]");
  }
  return out;
}

/** First line of an error, safe to store on a job or print. Never includes a key. */
export function readableError(err: unknown): string {
  let message = "Something went wrong";
  if (err && typeof err === "object" && "issues" in err && Array.isArray((err as { issues: unknown }).issues)) {
    try {
      message = formatZodError(err as Parameters<typeof formatZodError>[0]);
    } catch {
      message = err instanceof Error ? err.message : message;
    }
  } else if (err instanceof Error) {
    message = err.message.split("\n")[0]?.trim() || message;
  } else if (typeof err === "string") {
    message = err.split("\n")[0]?.trim() || message;
  }
  return redact(message).slice(0, 500);
}
