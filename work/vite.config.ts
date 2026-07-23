import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const configuredBase = process.env.PAGES_BASE_PATH ?? "/";
const base = configuredBase.endsWith("/")
  ? configuredBase
  : `${configuredBase}/`;

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
