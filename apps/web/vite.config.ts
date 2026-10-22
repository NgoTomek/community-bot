import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env at the repo root feeds both the worker and the web app.
  envDir: "../..",
  base: process.env.VITE_BASE ?? "/",
});
