import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBackend, BackendError, GrokBotBackend, OpenAiBackend } from "./backends";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("createBackend", () => {
  it("returns the named backend and rejects an unknown name", () => {
    expect(createBackend("mock").canBrowse).toBe(false);
    expect(createBackend("openai").canBrowse).toBe(false);
    expect(createBackend("grokbot").canBrowse).toBe(true);
    expect(() => createBackend("other")).toThrow(/Unknown backend/);
  });
});

describe("OpenAiBackend", () => {
  it("throws BackendError when the API key is missing and does not call the network", async () => {
    let called = false;
    globalThis.fetch = () => {
      called = true;
      throw new Error("network");
    };
    const backend = new OpenAiBackend({});
    await expect(backend.ask({ bot: "cb-scout", prompt: "hi" })).rejects.toBeInstanceOf(BackendError);
    await expect(backend.ask({ bot: "cb-scout", prompt: "hi" })).rejects.toThrow(/LLM_API_KEY/);
    expect(called).toBe(false);
  });

  it("posts chat completions with the standing rules as the system message", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init: init ?? {} };
      return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), { status: 200 });
    }) as typeof fetch;
    const backend = new OpenAiBackend({
      LLM_API_KEY: "secret-key",
      LLM_BASE_URL: "https://llm.example/v1/",
      LLM_MODEL: "test-model",
    });
    await expect(backend.ask({ bot: "cb-scout", standingRules: "standing", prompt: "hello" })).resolves.toBe('{"ok":true}');
    expect(seen?.url).toBe("https://llm.example/v1/chat/completions");
    const headers = new Headers(seen?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer secret-key");
    const body = JSON.parse(String(seen?.init.body)) as { model: string; messages: { role: string; content: string }[] };
    expect(body.model).toBe("test-model");
    expect(body.messages).toEqual([
      { role: "system", content: "standing" },
      { role: "user", content: "hello" },
    ]);
  });

  it("turns an aborted request into a timeout error", async () => {
    globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "TimeoutError";
          reject(error);
        });
      })) as typeof fetch;
    const backend = new OpenAiBackend({
      LLM_API_KEY: "secret-key",
      LLM_BASE_URL: "https://llm.example/v1",
      LLM_MODEL: "test-model",
      TURN_TIMEOUT_MS: 30,
    });
    await expect(backend.ask({ bot: "cb-scout", prompt: "hello" })).rejects.toThrow(/timed out after 30ms/);
  });
});

function fakeCli(dir: string, body: string): { script: string; log: string } {
  const log = join(dir, "log.jsonl");
  const script = join(dir, "grokbot.py");
  writeFileSync(
    script,
    `import json, sys
from pathlib import Path
log = Path(${JSON.stringify(log)})
args = sys.argv[1:]
with log.open("a") as fh:
    fh.write(json.dumps(args) + "\\n")
cmd = args[0]
${body}
`,
  );
  return { script, log };
}

function commands(log: string): string[][] {
  const text = readFileSync(log, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line) as string[]);
}

describe("GrokBotBackend", () => {
  it("creates a missing bot, then reads the newest bot entry", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cb-grok-"));
    try {
      const { script, log } = fakeCli(
        dir,
        `if cmd == "list":
    print("[]")
elif cmd == "create":
    print("{}")
elif cmd == "chat":
    print(json.dumps({"stillRunning": False, "newEntries": [
        {"author": "assistant", "text": "older"},
        {"author": "user", "text": "echo"},
        {"author": "assistant", "text": "newest bot"},
        {"author": "user", "text": "trailing"}
    ]}))
else:
    print("{}")
`,
      );
      const backend = new GrokBotBackend({ GROKBOT_SKILL_PATH: script, TURN_TIMEOUT_MS: 2500 });
      await expect(backend.ask({ bot: "cb-scout", standingRules: "rules v1", prompt: "hello" })).resolves.toBe("newest bot");
      const argv = commands(log);
      expect(argv[0]).toEqual(["list", "--full"]);
      expect(argv[1]?.[0]).toBe("create");
      expect(argv[1]).toContain("--no-kickstart");
      expect(argv[1]).toContain("--description");
      expect(argv[1]).toContain("rules v1");
      expect(argv.some((args) => args[0] === "update")).toBe(false);
      const chat = argv.find((args) => args[0] === "chat");
      expect(chat).toContain("--timeout");
      expect(chat?.[chat.indexOf("--timeout") + 1]).toBe("3");
      expect(chat).toContain("--prompt");
      expect(chat).toContain("hello");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("updates when the standing rules changed, and skips update when they match", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cb-grok-"));
    try {
      const { script, log } = fakeCli(
        dir,
        `if cmd == "list":
    print(json.dumps([{"name": "cb-scout", "title": "Scout Bot", "description": "old rules"}]))
elif cmd == "chat":
    print(json.dumps({"stillRunning": False, "newEntries": [{"author": "assistant", "text": "ok"}]}))
else:
    print("{}")
`,
      );
      const backend = new GrokBotBackend({ GROKBOT_SKILL_PATH: script, TURN_TIMEOUT_MS: 1000 });
      await backend.ask({ bot: "cb-scout", standingRules: "new rules", prompt: "hi" });
      const argv = commands(log);
      expect(argv.map((args) => args[0])).toEqual(["list", "update", "chat"]);
      const update = argv[1] ?? [];
      expect(update).toContain("--description");
      expect(update).toContain("new rules");
      expect(update).not.toContain("--no-kickstart");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    const same = mkdtempSync(join(tmpdir(), "cb-grok-"));
    try {
      const { script, log } = fakeCli(
        same,
        `if cmd == "list":
    print(json.dumps([{"name": "cb-scout", "title": "Scout Bot", "description": "same rules"}]))
elif cmd == "chat":
    print(json.dumps({"stillRunning": False, "newEntries": [{"author": "bot", "text": "kept"}]}))
else:
    raise SystemExit("unexpected " + cmd)
`,
      );
      const backend = new GrokBotBackend({ GROKBOT_SKILL_PATH: script });
      await expect(backend.ask({ bot: "cb-scout", standingRules: "same rules", prompt: "hi" })).resolves.toBe("kept");
      expect(commands(log).map((args) => args[0])).toEqual(["list", "chat"]);
    } finally {
      rmSync(same, { recursive: true, force: true });
    }
  });

  it("retries the whole turn once after a failed chat", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cb-grok-"));
    try {
      const { script, log } = fakeCli(
        dir,
        `if cmd == "list":
    print("[]")
elif cmd == "create":
    print("{}")
elif cmd == "chat":
    chats = sum(1 for line in log.read_text().splitlines() if json.loads(line)[0] == "chat")
    if chats == 1:
        print(json.dumps({"error": "try again"}), file=sys.stderr)
        raise SystemExit(1)
    print(json.dumps({"stillRunning": False, "newEntries": [{"author": "assistant", "text": "second try"}]}))
else:
    print("{}")
`,
      );
      const backend = new GrokBotBackend({ GROKBOT_SKILL_PATH: script, TURN_TIMEOUT_MS: 1000 });
      await expect(backend.ask({ bot: "cb-matchmaker", standingRules: "rank", prompt: "go" })).resolves.toBe("second try");
      const chats = commands(log).filter((args) => args[0] === "chat");
      expect(chats).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
