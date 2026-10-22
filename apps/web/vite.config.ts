import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Dev server only: packages/core is edited in parallel, and its index can briefly export a
 * module that is not written yet. Serve an empty module instead of taking the app down.
 * Production builds still fail on a missing module.
 */
function tolerateMissingCoreModules(): Plugin {
  return {
    name: "tolerate-missing-core-modules",
    apply: "serve",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !importer.includes("/packages/core/src/") || !source.startsWith("./")) return null;
      const base = resolve(dirname(importer), source);
      if ([base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].some((p) => existsSync(p))) return null;
      return `\0missing-core:${source}`;
    },
    load(id) {
      return id.startsWith("\0missing-core:") ? "export {};" : null;
    },
  };
}

export default defineConfig({
  plugins: [tolerateMissingCoreModules(), react(), tailwindcss()],
  // One .env at the repo root feeds both the worker and the web app.
  envDir: "../..",
  base: process.env.VITE_BASE ?? "/",
});
