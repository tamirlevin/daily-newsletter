import { renderToString } from "react-dom/server";
import dailySeedData from "@/data/seed-daily-run.json";
import weeklySeedData from "@/data/seed-run.json";
import { BriefingApp, type PublicationRun } from "./briefing-app";

type ViewName =
  | "daily"
  | "weekly"
  | "history-daily"
  | "history-weekly"
  | "system";

type RunsByCadence = Record<"daily" | "weekly", PublicationRun[]>;

const defaultRuns = {
  daily: [dailySeedData as PublicationRun],
  weekly: [weeklySeedData as PublicationRun],
};

export function renderWithRuns(
  seedRuns: RunsByCadence,
  initialView: ViewName = "daily",
) {
  return renderToString(
    <BriefingApp seedRuns={seedRuns} initialView={initialView} />,
  );
}

export function render() {
  return renderWithRuns(defaultRuns);
}
