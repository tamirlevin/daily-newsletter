import { renderToString } from "react-dom/server";
import seedData from "@/data/seed-run.json";
import { BriefingApp, type PublicationRun } from "./briefing-app";

export function render() {
  return renderToString(
    <BriefingApp seedRun={seedData as PublicationRun} />,
  );
}
