import { renderToString } from "react-dom/server";
import dailySeedData from "@/data/seed-daily-run.json";
import weeklySeedData from "@/data/seed-run.json";
import { BriefingApp, type PublicationRun } from "./briefing-app";

export function render() {
  return renderToString(
    <BriefingApp
      seedRuns={{
        daily: [dailySeedData as PublicationRun],
        weekly: [weeklySeedData as PublicationRun],
      }}
    />,
  );
}
