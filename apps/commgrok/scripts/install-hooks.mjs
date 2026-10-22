// Points git at this app's hooks folder. Works whether the app is the repo root
// or lives in a monorepo subfolder (e.g. apps/commgrok). Runs from `npm install` (prepare).
import { execSync } from "node:child_process";
try {
  const prefix = execSync("git rev-parse --show-prefix", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  execSync(`git config core.hooksPath "${prefix}.githooks"`, { stdio: "ignore" });
  console.log(`git hooks: core.hooksPath = ${prefix}.githooks`);
} catch {
  // Not a git checkout (e.g. a tarball install): nothing to do.
}
