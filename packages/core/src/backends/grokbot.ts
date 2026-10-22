import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { BackendError, turnTimeoutMs, type AskRequest, type Backend, type BackendEnv } from "./types";
import { extractJson } from "../json";

const DEFAULT_SKILL = "~/.cursor/skills/grok-bot/scripts/grokbot.py";
const MANAGEMENT_TIMEOUT_MS = 30_000;

/**
 * Grok Bot teammates via the grok-bot skill CLI. The Scout can browse (`canBrowse`).
 * Prompts and errors never include API keys or gateway tokens.
 */
export class GrokBotBackend implements Backend {
  readonly name = "grokbot" as const;
  readonly canBrowse = true;

  constructor(private readonly env: BackendEnv = {}) {}

  async ask(request: AskRequest): Promise<string> {
    const rules = request.standingRules ?? "";
    const seconds = Math.max(1, Math.ceil(turnTimeoutMs(this.env) / 1000));
    let last: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.ensureBot(request.bot, rules);
        const payload = await this.run(
          ["chat", "--name", request.bot, "--prompt", request.prompt, "--timeout", String(seconds)],
          seconds * 1000 + 15_000,
        );
        return newestBotReply(payload);
      } catch (error) {
        last = error;
      }
    }
    if (last instanceof BackendError) throw last;
    throw new BackendError(last instanceof Error ? last.message : "Grok Bot turn failed.");
  }

  private async ensureBot(name: string, rules: string): Promise<void> {
    const listed = listedBots(await this.run(["list", "--full"], MANAGEMENT_TIMEOUT_MS));
    const existing = listed.find((bot) => String(bot.name ?? "").toLowerCase() === name.toLowerCase());
    const title = titleFor(name, rules);
    if (!existing) {
      await this.run(
        ["create", "--name", name, "--title", title, "--description", rules, "--no-kickstart"],
        MANAGEMENT_TIMEOUT_MS,
      );
      return;
    }
    const description = typeof existing.description === "string" ? existing.description : "";
    if (description !== rules) {
      await this.run(
        ["update", "--name", name, "--title", title, "--description", rules],
        MANAGEMENT_TIMEOUT_MS,
      );
    }
  }

  private run(args: string[], timeoutMs: number): Promise<unknown> {
    const script = expandHome(this.env.GROKBOT_SKILL_PATH?.trim() || DEFAULT_SKILL);
    return new Promise((resolve, reject) => {
      const child = spawn("python3", [script, ...args], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(() => reject(new BackendError(`Grok Bot timed out after ${timeoutMs}ms.`)));
      }, timeoutMs);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        finish(() => reject(new BackendError(`Could not start the Grok Bot CLI (${error.message}).`)));
      });
      child.on("close", (code) => {
        finish(() => {
          if (code !== 0) {
            reject(new BackendError(safeCliMessage(stderr, code)));
            return;
          }
          try {
            resolve(JSON.parse(stdout));
          } catch {
            try {
              resolve(extractJson(stdout));
            } catch {
              reject(new BackendError("Grok Bot CLI did not return JSON."));
            }
          }
        });
      });
    });
  }
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function listedBots(payload: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.agents) ? payload.agents : null;
  if (!rows) throw new BackendError("Grok Bot list did not return a JSON array.");
  return rows.filter(isRecord);
}

function titleFor(bot: string, rules: string): string {
  const named = /^You are the Bot for (.+?)\. You represent/.exec(rules);
  if (named?.[1]) return `${named[1]} Bot`.slice(0, 120);
  if (bot === "cb-scout") return "Scout Bot";
  if (bot === "cb-matchmaker") return "Matchmaker Bot";
  if (bot === "cb-scribe") return "Scribe";
  return bot;
}

function newestBotReply(payload: unknown): string {
  if (!isRecord(payload)) throw new BackendError("Grok Bot chat did not return a JSON object.");
  if (payload.stillRunning === true) throw new BackendError("Grok Bot did not finish before the timeout.");
  const entries = Array.isArray(payload.newEntries) ? payload.newEntries : [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!isRecord(entry)) continue;
    const author = typeof entry.author === "string" ? entry.author.toLowerCase() : "";
    const kind = typeof entry.kind === "string" ? entry.kind.toLowerCase() : "";
    if (author === "user" || author === "human" || kind === "user" || kind === "human") continue;
    if (typeof entry.text === "string" && entry.text.trim()) return entry.text;
  }
  throw new BackendError("Grok Bot returned no reply.");
}

function safeCliMessage(stderr: string, code: number | null): string {
  let message = "";
  try {
    const parsed = JSON.parse(stderr.trim()) as { error?: unknown };
    if (typeof parsed.error === "string") message = parsed.error.trim();
  } catch {
    message = "";
  }
  if (!message || /bearer\s+\S+/i.test(message) || /\bsk-[a-z0-9]/i.test(message) || message.includes("eyJ")) {
    return `Grok Bot command failed (exit ${code ?? "unknown"}).`;
  }
  return message.slice(0, 500);
}
