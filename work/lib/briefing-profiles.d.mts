export type Cadence = "daily" | "weekly";

export type BriefingProfile = {
  cadence: Cadence;
  label: string;
  lookbackDays: number;
  maxItems: number;
  editorialMix: Readonly<Record<string, number>>;
  expectedMix: Readonly<Record<string, number>>;
  retainedRuns: number;
  emailEnabled: boolean;
};

export const CADENCES: readonly Cadence[];
export const BRIEFING_PROFILES: Readonly<Record<Cadence, BriefingProfile>>;

export function normalizeCadence(
  value: unknown,
  fallback?: Cadence,
): Cadence;
export function briefingProfile(value: unknown): BriefingProfile;
export function runIdFor(cadence: unknown, issueDate: string): string;
