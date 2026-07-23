import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const LOCAL_DATABASE_ID = "00000000-0000-4000-8000-000000000000";

export default defineConfig(async ({ isSsrBuild }) => {
  const shared = {
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname),
      },
    },
  };

  if (isSsrBuild) {
    return {
      ...shared,
      plugins: [react()],
    };
  }

  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const d1Databases = hostingConfig.d1
    ? [
        {
          binding: hostingConfig.d1,
          database_name: "ai-weekly-brief",
          database_id: LOCAL_DATABASE_ID,
        },
      ]
    : [];

  return {
    ...shared,
    base: "/",
    plugins: [
      react(),
      sites(),
      cloudflare({
        config: {
          name: "ai-weekly-brief",
          main: "./worker/index.ts",
          compatibility_date: "2026-07-23",
          compatibility_flags: ["nodejs_compat"],
          assets: {
            not_found_handling: "single-page-application",
          },
          d1_databases: d1Databases,
        },
      }),
    ],
  };
});
