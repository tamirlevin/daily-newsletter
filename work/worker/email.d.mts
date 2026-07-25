export function renderDailyEmail(
  run: {
    issueDate: string;
    items?: Array<Record<string, any>>;
  },
  publicBaseUrl: string,
): {
  subject: string;
  html: string;
  text: string;
};
