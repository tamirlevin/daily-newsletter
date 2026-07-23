export const RETAINED_RUNS: number;
export const EXPECTED_MIX: Readonly<{
  executive: number;
  technical: number;
  research: number;
}>;

export function validatePublicationRun(payload: unknown): {
  runId: string;
  issueDate: string;
  generatedAt: string;
  sourceHealth: string;
  mix: Record<string, number>;
};

export function preparePublishedRun(
  payload: unknown,
  publishedAt?: string,
): {
  runId: string;
  issueDate: string;
  generatedAt: string;
  publishedAt: string;
  sourceHealth: string;
  mix: Record<string, number>;
  payload: Record<string, unknown>;
};
