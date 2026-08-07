export const CADENCES = Object.freeze(["daily", "weekly"]);

export const BRIEFING_PROFILES = Object.freeze({
  daily: Object.freeze({
    cadence: "daily",
    label: "Daily",
    lookbackDays: 3,
    maxItems: 5,
    editorialMix: Object.freeze({
      executive: 0.6,
      technical: 0.2,
      builder: 0.2,
    }),
    expectedMix: Object.freeze({
      executive: 3,
      technical: 1,
      builder: 1,
    }),
    selectionRules: Object.freeze({
      maxModelLabItems: 2,
    }),
    retainedRuns: 7,
    emailEnabled: true,
  }),
  weekly: Object.freeze({
    cadence: "weekly",
    label: "Weekly",
    lookbackDays: 7,
    maxItems: 10,
    editorialMix: Object.freeze({
      executive: 0.7,
      technical: 0.2,
      builder: 0.1,
    }),
    expectedMix: Object.freeze({
      executive: 7,
      technical: 2,
      builder: 1,
    }),
    selectionRules: Object.freeze({
      maxModelLabItems: 3,
    }),
    retainedRuns: 3,
    emailEnabled: false,
  }),
});

export function normalizeCadence(value, fallback = "weekly") {
  const cadence = String(value ?? fallback).trim().toLocaleLowerCase();
  if (!CADENCES.includes(cadence)) {
    throw new Error(`Unsupported cadence: ${value}`);
  }
  return cadence;
}

export function briefingProfile(value) {
  return BRIEFING_PROFILES[normalizeCadence(value)];
}

export function runIdFor(cadence, issueDate) {
  return `${normalizeCadence(cadence)}:${issueDate}`;
}
