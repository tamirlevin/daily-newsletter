import { renderToString } from "react-dom/server";
import issueData from "@/data/issue.json";
import { BriefingApp, type BriefIssue } from "./briefing-app";

export function render() {
  return renderToString(
    <BriefingApp issue={issueData as BriefIssue} />,
  );
}
