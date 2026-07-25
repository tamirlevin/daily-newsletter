import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import dailySeedData from "@/data/seed-daily-run.json";
import weeklySeedData from "@/data/seed-run.json";
import { BriefingApp, type PublicationRun } from "./briefing-app";
import "./globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Reader root element was not found");
}

const app = (
  <StrictMode>
    <BriefingApp
      seedRuns={{
        daily: [dailySeedData as PublicationRun],
        weekly: [weeklySeedData as PublicationRun],
      }}
    />
  </StrictMode>
);

if (root.hasChildNodes()) {
  hydrateRoot(root, app);
} else {
  createRoot(root).render(app);
}
