import type {
  CollectedStory,
  PublicationRun,
} from "./briefing-app";

export const LANE_LABELS: Readonly<
  Record<CollectedStory["editorialLane"], string>
>;

export function publisherLabel(story: CollectedStory): string;
export function discoveryLabel(story: CollectedStory): string;
export function storyMatches(story: CollectedStory, query: string): boolean;
export function issueStoryNumber(
  items: CollectedStory[],
  story: CollectedStory,
): number;
export function historyRunMatches(
  run: PublicationRun,
  query: string,
  formattedIssueDate?: string,
): boolean;
export function visibleHistoryStories(
  run: PublicationRun,
  query: string,
  formattedIssueDate?: string,
): CollectedStory[];
