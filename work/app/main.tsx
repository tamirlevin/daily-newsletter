import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import issueData from "@/data/issue.json";
import { BriefingApp, type BriefIssue } from "./briefing-app";
import "./globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Reader root element was not found");
}

hydrateRoot(
  root,
  <StrictMode>
    <BriefingApp issue={issueData as BriefIssue} />
  </StrictMode>,
);
