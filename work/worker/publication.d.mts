export const RETAINED_RUNS_BY_CADENCE: Readonly<Record<string, number>>;
export const EXPECTED_MIX_BY_CADENCE: Readonly<
  Record<string, Readonly<Record<string, number>>>
>;

export function validatePublicationRun(payload: unknown): {
  runId: string;
  cadence: "daily" | "weekly";
  issueDate: string;
  generatedAt: string;
  sourceHealth: string;
  mix: Record<string, number>;
  retainedRuns: number;
  emailEligible: boolean;
};

export function preparePublishedRun(
  payload: unknown,
  publishedAt?: string,
): {
  runId: string;
  cadence: "daily" | "weekly";
  issueDate: string;
  generatedAt: string;
  publishedAt: string;
  sourceHealth: string;
  mix: Record<string, number>;
  retainedRuns: number;
  emailEligible: boolean;
  payload: any;
};
