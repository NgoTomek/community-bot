#!/usr/bin/env node
/**
 * docs-check: fails (exit 1) when the docs drift from the code.
 *
 *   node scripts/docs-check.mjs [--staged] [--skip-lint] [--stamp]
 *
 * Checks (Node standard library only, plain regex parsing, see AGENTS.md for the contract):
 *   1. API routes + methods (app/api/**\/route.ts)  <->  docs/openapi.yaml paths (both directions)
 *   2. Env vars read in code  <->  .env.example  <->  docs/HANDOFF.md env table (both directions)
 *   3. Every file path cited in docs/*.md exists
 *   4. EventStatus / Decision / WebhookType (lib/types.ts) == HANDOFF marker lists == openapi enums
 *   5. Webhook types emitted in lib/workflow.ts == documented WebhookType values
 *   6. --staged: code changes under app/api/, lib/ or supabase/ need a docs/CHANGELOG.md entry
 *   7. Redocly lint of docs/openapi.yaml (skip with --skip-lint or DOCS_CHECK_SKIP_LINT=1)
 *   --stamp: after everything passes, rewrite the <!-- docs:stamp --> line in docs/HANDOFF.md
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const STAMP = args.has("--stamp");
const STAGED = args.has("--staged");
const SKIP_LINT = args.has("--skip-lint") || process.env.DOCS_CHECK_SKIP_LINT === "1";
const REDOCLY = "@redocly/cli@2.69.0";

const HANDOFF = "docs/HANDOFF.md";
const OPENAPI = "docs/openapi.yaml";
const CHANGELOG = "docs/CHANGELOG.md";
const ENV_EXAMPLE = ".env.example";
const IGNORED_ENV = new Set(["NODE_ENV", "NEXT_RUNTIME"]);
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const ENUMS = [
  { type: "EventStatus", marker: "event-statuses" },
  { type: "Decision", marker: "decisions" },
  { type: "WebhookType", marker: "webhook-types" },
];
const PATH_PREFIXES = ["app/", "lib/", "components/", "scripts/", "supabase/", "docs/", "public/", ".github/", ".githooks/"];
const ROOT_FILES = new Set([".env.example", "package.json", "AGENTS.md", "CLAUDE.md", "README.md", "next.config.ts", "redocly.yaml", "LICENSE"]);

// ---------------------------------------------------------------- output helpers
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
let failures = 0;
const ok = (msg) => console.log(`${c(32, "✔")} ${msg}`);
const warn = (msg) => console.log(`${c(33, "⚠")} ${msg}`);
const note = (msg) => console.log(`${c(90, "•")} ${msg}`);
/** fail("Routes", ["detail", ...], "what to do") */
function fail(msg, details = [], fix) {
  failures++;
  console.log(`${c(31, "✖")} ${msg}`);
  for (const d of details) console.log(`    - ${d}`);
  if (fix) console.log(`    ${c(36, "→ fix:")} ${fix}`);
}

// ---------------------------------------------------------------- fs helpers
const abs = (p) => join(ROOT, p);
const rel = (p) => relative(ROOT, p).split(sep).join("/");
const read = (p) => (existsSync(abs(p)) ? readFileSync(abs(p), "utf8").replace(/\r\n/g, "\n") : null);
function walk(dir, filter, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".git")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, filter, out);
    else if (filter(name)) out.push(p);
  }
  return out;
}
const sorted = (set) => [...set].sort();
const diff = (a, b) => sorted(new Set([...a].filter((x) => !b.has(x))));
const fmt = (set) => (set.size ? sorted(set).join(", ") : "(none)");

// ---------------------------------------------------------------- load docs
const handoff = read(HANDOFF);
const openapi = read(OPENAPI);
if (handoff == null) fail(`${HANDOFF} not found`, [], `Create ${HANDOFF} with the docs:* markers described in AGENTS.md.`);
if (openapi == null) fail(`${OPENAPI} not found`, [], `Create ${OPENAPI} (OpenAPI 3.1, 2-space block YAML) describing every app/api route.`);

/** Inner text between <!-- docs:NAME --> and <!-- /docs:NAME -->, or null. */
function markerBlock(text, name) {
  if (text == null) return null;
  const m = text.match(new RegExp(`<!--\\s*docs:${name}\\s*-->([\\s\\S]*?)<!--\\s*/docs:${name}\\s*-->`));
  return m ? m[1] : null;
}
const backticked = (s) => [...s.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());

// ---------------------------------------------------------------- 1. routes <-> openapi
function codeRoutes() {
  const out = new Map(); // "METHOD /url" -> file
  for (const file of walk(abs("app/api"), (n) => n === "route.ts")) {
    const dir = rel(dirname(file)).replace(/^app\//, "");
    const url = "/" + dir.replace(/\[([^\]]+)\]/g, "{$1}");
    const src = readFileSync(file, "utf8");
    const re = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g;
    for (const m of src.matchAll(re)) out.set(`${m[1] || m[2]} ${url}`, rel(file));
  }
  return out;
}
function openapiRoutes(text) {
  const out = new Set();
  const lines = text.split("\n");
  let inPaths = false;
  let current = null;
  for (const line of lines) {
    if (/^\S/.test(line)) {
      inPaths = /^paths:\s*$/.test(line);
      current = null;
      continue;
    }
    if (!inPaths) continue;
    const p = line.match(/^ {2}(\/[^:\s]*)\s*:\s*$/) || line.match(/^ {2}["'](\/[^"']*)["']\s*:\s*$/);
    if (p) {
      current = p[1];
      continue;
    }
    if (/^ {2}\S/.test(line)) current = null; // some other 2-space key
    const m = current && line.match(/^ {4}(get|post|put|patch|delete)\s*:/);
    if (m) out.add(`${m[1].toUpperCase()} ${current}`);
  }
  return out;
}
{
  const code = codeRoutes();
  if (openapi != null) {
    const docs = openapiRoutes(openapi);
    const codeSet = new Set(code.keys());
    const missing = diff(codeSet, docs);
    const extra = diff(docs, codeSet);
    if (!missing.length && !extra.length) ok(`Routes: ${codeSet.size} route methods in app/api match ${OPENAPI}`);
    else {
      if (missing.length)
        fail(
          `Routes: ${missing.length} route method(s) exist in code but not in ${OPENAPI}`,
          missing.map((r) => `${r}   (${code.get(r)})`),
          `Document them under \`paths:\` in ${OPENAPI} (path key at 2 spaces, method at 4 spaces, {param} for [param]).`,
        );
      if (extra.length)
        fail(
          `Routes: ${extra.length} route method(s) documented in ${OPENAPI} but not in code`,
          extra,
          `Remove them from ${OPENAPI}, or add the handler (export function METHOD) in app/api/.../route.ts.`,
        );
    }
  }
}

// ---------------------------------------------------------------- 2. env vars
{
  const files = [
    ...walk(abs("app"), (n) => /\.(ts|tsx|js|jsx|mjs)$/.test(n)),
    ...walk(abs("lib"), (n) => /\.(ts|tsx|js|jsx|mjs)$/.test(n)),
    ...walk(abs("components"), (n) => /\.(ts|tsx|js|jsx|mjs)$/.test(n)),
    ...(existsSync(abs("next.config.ts")) ? [abs("next.config.ts")] : []),
  ];
  const code = new Map(); // var -> first file
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)|process\.env\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g)) {
      const v = m[1] || m[2];
      if (!IGNORED_ENV.has(v) && !code.has(v)) code.set(v, rel(f));
    }
  }
  const codeSet = new Set(code.keys());
  const exampleText = read(ENV_EXAMPLE);
  const example = new Set();
  if (exampleText == null) fail(`Env: ${ENV_EXAMPLE} not found`, [], `Create ${ENV_EXAMPLE} listing every variable the code reads.`);
  else for (const m of exampleText.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) example.add(m[1]);

  const table = markerBlock(handoff, "env");
  const documented = new Set();
  if (handoff != null && table == null)
    fail(`Env: no <!-- docs:env --> … <!-- /docs:env --> table in ${HANDOFF}`, [], `Add the env table between those markers (first column = \`VAR_NAME\`).`);
  if (table != null) {
    for (const line of table.split("\n")) {
      const cells = line.trim().match(/^\|(.*)\|?$/);
      if (!cells) continue;
      const first = cells[1].split("|")[0];
      const m = first.match(/`([A-Za-z_][A-Za-z0-9_]*)`/);
      if (m) documented.add(m[1]);
    }
  }

  const problems = [];
  if (exampleText != null) {
    const a = diff(codeSet, example);
    if (a.length) problems.push([`read in code but missing from ${ENV_EXAMPLE}`, a.map((v) => `${v}   (${code.get(v)})`), `Add \`${a[0]}=\` (with a comment) to ${ENV_EXAMPLE}.`]);
    const b = diff(example, codeSet);
    if (b.length) problems.push([`in ${ENV_EXAMPLE} but never read in code`, b, `Remove them from ${ENV_EXAMPLE}, or read them via process.env in app/, lib/, components/ or next.config.ts.`]);
  }
  if (table != null) {
    const a = diff(codeSet, documented);
    if (a.length) problems.push([`read in code but missing from the ${HANDOFF} env table`, a.map((v) => `${v}   (${code.get(v)})`), `Add a \`| \\\`${a[0]}\\\` | … |\` row inside <!-- docs:env --> in ${HANDOFF}.`]);
    const b = diff(documented, codeSet);
    if (b.length) problems.push([`in the ${HANDOFF} env table but never read in code`, b, `Remove those rows from the docs:env table in ${HANDOFF}.`]);
  }
  if (!problems.length && exampleText != null && table != null) ok(`Env: ${codeSet.size} variables match ${ENV_EXAMPLE} and the ${HANDOFF} env table`);
  for (const [what, list, fix] of problems) fail(`Env: ${list.length} variable(s) ${what}`, list, fix);
}

// ---------------------------------------------------------------- 3. cited file paths exist
{
  const mdFiles = existsSync(abs("docs")) ? readdirSync(abs("docs")).filter((n) => n.endsWith(".md")).map((n) => `docs/${n}`) : [];
  const broken = [];
  let checked = 0;
  const qualifies = (p) => PATH_PREFIXES.some((pre) => p.startsWith(pre)) || ROOT_FILES.has(p);
  const clean = (t) => t.replace(/#.*$/, "").replace(/:\d+(?:[-:]\d+)*$/, "").replace(/^\.\//, "");
  const skip = (t) => /[*<>{} ]|\.\.\./.test(t) || t.startsWith("/") || /^[a-z]+:\/\//i.test(t);
  for (const md of mdFiles) {
    const text = read(md).replace(/^(```|~~~)[\s\S]*?^\1/gm, ""); // ignore fenced code blocks
    const seen = new Set();
    for (const raw of backticked(text)) {
      if (skip(raw)) continue;
      const p = clean(raw);
      if (!p || !qualifies(p) || seen.has(p)) continue;
      seen.add(p);
      checked++;
      if (!existsSync(abs(p))) broken.push(`${md}: \`${raw}\``);
    }
    for (const m of text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      const raw = m[1];
      if (/^(?:[a-z]+:|#)/i.test(raw) || skip(raw)) continue;
      const p = clean(decodeURI(raw));
      if (!p) continue;
      const fromDoc = rel(resolve(dirname(abs(md)), p)); // GitHub resolves links relative to the .md file
      if (!qualifies(p) && !qualifies(fromDoc)) continue;
      if (seen.has(`link:${p}`)) continue;
      seen.add(`link:${p}`);
      checked++;
      if (!existsSync(abs(fromDoc)) && !existsSync(abs(p))) broken.push(`${md}: link (${raw})`);
    }
  }
  if (!mdFiles.length) warn("Paths: no docs/*.md files to check");
  else if (!broken.length) ok(`Paths: ${checked} file paths cited in ${mdFiles.length} docs/*.md files exist`);
  else fail(`Paths: ${broken.length} cited path(s) in docs/*.md do not exist`, broken, `Fix the path in the named doc (or restore the file). Paths are relative to the repo root; links are resolved from the .md file.`);
}

// ---------------------------------------------------------------- 4 + 5. enums
const typesSrc = read("lib/types.ts");
const documentedWebhooks = { set: null };
{
  if (typesSrc == null) fail("Enums: lib/types.ts not found", [], "Restore lib/types.ts.");
  for (const { type, marker } of ENUMS) {
    if (typesSrc == null) break;
    const m = typesSrc.match(new RegExp(`export\\s+type\\s+${type}\\s*=([^;]+);`));
    if (!m) {
      fail(`Enums: \`export type ${type} = "…" | "…";\` not found in lib/types.ts`, [], `Keep ${type} as a string-literal union in lib/types.ts.`);
      continue;
    }
    const code = new Set([...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]));
    const sources = [];
    const block = markerBlock(handoff, marker);
    if (handoff != null) {
      if (block == null) fail(`Enums: ${type}: no <!-- docs:${marker} --> block in ${HANDOFF}`, [], `Add <!-- docs:${marker} --> \`a\`, \`b\` <!-- /docs:${marker} --> to ${HANDOFF}.`);
      else sources.push([`${HANDOFF} <!-- docs:${marker} -->`, new Set(backticked(block)), `Edit the docs:${marker} list in ${HANDOFF}.`]);
    }
    if (openapi != null) {
      const s = openapi.match(new RegExp(`^ {4}${type}:\\s*\\n((?:.*\\n){0,8})`, "m"));
      const e = s && s[1].match(/^\s+enum:\s*\[([^\]]*)\]/m);
      if (!e) fail(`Enums: ${type}: no \`    ${type}:\` schema with a flow \`enum: [...]\` in ${OPENAPI}`, [], `Add components.schemas.${type} with \`enum: [${sorted(code).join(", ")}]\` to ${OPENAPI}.`);
      else sources.push([`${OPENAPI} components.schemas.${type}`, new Set(e[1].split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean)), `Edit the ${type} enum in ${OPENAPI}.`]);
    }
    let allOk = true;
    for (const [where, set, fix] of sources) {
      const missing = diff(code, set);
      const extra = diff(set, code);
      if (missing.length || extra.length) {
        allOk = false;
        fail(
          `Enums: ${type} in ${where} differs from lib/types.ts`,
          [`lib/types.ts: ${fmt(code)}`, `docs:        ${fmt(set)}`, ...(missing.length ? [`missing in docs: ${missing.join(", ")}`] : []), ...(extra.length ? [`not in code:     ${extra.join(", ")}`] : [])],
          fix,
        );
      }
    }
    if (type === "WebhookType") documentedWebhooks.set = sources.length ? sources[0][1] : code;
    if (allOk && sources.length) ok(`Enums: ${type} (${code.size} values) matches ${sources.map(([w]) => w).join(" and ")}`);
  }
}
{
  const wf = read("lib/workflow.ts");
  if (wf == null) fail("Webhooks: lib/workflow.ts not found", [], "Restore lib/workflow.ts.");
  else if (documentedWebhooks.set) {
    const emitted = new Set([...wf.matchAll(/"(event\.[a-z_]+)"/g)].map((m) => m[1]));
    const missing = diff(emitted, documentedWebhooks.set);
    const extra = diff(documentedWebhooks.set, emitted);
    if (!missing.length && !extra.length) ok(`Webhooks: ${emitted.size} webhook types emitted in lib/workflow.ts are documented`);
    else
      fail(
        "Webhooks: types emitted in lib/workflow.ts differ from the documented WebhookType values",
        [`emitted:    ${fmt(emitted)}`, `documented: ${fmt(documentedWebhooks.set)}`],
        `Update WebhookType in lib/types.ts, the docs:webhook-types list in ${HANDOFF} and the WebhookType enum in ${OPENAPI} together.`,
      );
  }
}

// ---------------------------------------------------------------- git helpers
function git(...a) {
  const r = spawnSync("git", a, { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}
const inGit = git("rev-parse", "--is-inside-work-tree") === "true";

// ---------------------------------------------------------------- 6. --staged changelog rule
if (STAGED) {
  if (!inGit) note("Changelog: not a git repo, skipped");
  else {
    const staged = (git("diff", "--cached", "--name-only", "--relative") || "").split("\n").filter(Boolean);
    const code = staged.filter((f) => /^(app\/api\/|lib\/|supabase\/)/.test(f));
    if (!code.length) ok("Changelog: no staged changes under app/api/, lib/ or supabase/");
    else if (staged.includes(CHANGELOG)) ok(`Changelog: ${CHANGELOG} is staged alongside ${code.length} code file(s)`);
    else fail(`Changelog: ${code.length} staged code file(s) but no ${CHANGELOG} change`, code, `Add an entry under ## [Unreleased] in ${CHANGELOG} (and git add it).`);
  }
}

// ---------------------------------------------------------------- 7. redocly lint
if (openapi != null) {
  if (SKIP_LINT) warn(`Lint: skipped (${args.has("--skip-lint") ? "--skip-lint" : "DOCS_CHECK_SKIP_LINT=1"})`);
  else {
    const r = spawnSync(`npx --yes ${REDOCLY} lint ${OPENAPI} --format=stylish`, { cwd: ROOT, encoding: "utf8", shell: true, timeout: 240_000 });
    if (r.status === 0) ok(`Lint: ${OPENAPI} passes redocly lint (${REDOCLY})`);
    else {
      const out = `${r.stdout || ""}${r.stderr || ""}`.trim() || (r.error ? String(r.error) : "(no output)");
      fail(`Lint: redocly lint failed on ${OPENAPI}`, out.split("\n").slice(-60), `Run \`npx --yes ${REDOCLY} lint ${OPENAPI}\` and fix the reported problems (rule config lives in redocly.yaml).`);
    }
  }
}

// ---------------------------------------------------------------- stamp + summary
if (STAMP) {
  if (failures) note("Stamp: not written because checks failed");
  else if (handoff == null || !/<!--\s*docs:stamp\s*-->[\s\S]*?<!--\s*\/docs:stamp\s*-->/.test(handoff))
    fail(`Stamp: no <!-- docs:stamp -->…<!-- /docs:stamp --> marker in ${HANDOFF}`, [], `Add the stamp marker near the top of ${HANDOFF}.`);
  else {
    const sha = (inGit && git("rev-parse", "--short", "HEAD")) || "uncommitted";
    const day = new Date().toISOString().slice(0, 10);
    const raw = readFileSync(abs(HANDOFF), "utf8");
    const next = raw.replace(/(<!--\s*docs:stamp\s*-->)[\s\S]*?(<!--\s*\/docs:stamp\s*-->)/, `$1_Last verified against commit \`${sha}\` on ${day}_$2`);
    if (next !== raw) writeFileSync(abs(HANDOFF), next);
    ok(`Stamp: ${HANDOFF} verified against \`${sha}\` on ${day}${next === raw ? " (unchanged)" : ""}`);
  }
}

console.log("");
if (failures) {
  console.log(c(31, `docs:check failed with ${failures} problem(s). The docs contract is in AGENTS.md.`));
  process.exit(1);
}
console.log(c(32, "docs:check passed."));
