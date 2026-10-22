import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "../../..");

export default defineConfig({
  root: webRoot,
  plugins: [react(), tailwindcss()],
  envDir: resolve(webRoot, "../.."),
  resolve: {
    alias: [
      { find: /^\.\/index\.css$/, replacement: resolve(here, "__scratch_theme.css") },
      { find: /^\.\/App$/, replacement: resolve(here, "__scratch_App.tsx") },
    ],
  },
  server: { port: 5189, strictPort: true },
});
