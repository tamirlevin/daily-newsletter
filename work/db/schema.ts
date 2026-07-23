import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const briefRuns = sqliteTable(
  "brief_runs",
  {
    runId: text("run_id").primaryKey(),
    issueDate: text("issue_date").notNull(),
    generatedAt: text("generated_at").notNull(),
    publishedAt: text("published_at").notNull(),
    sourceHealth: text("source_health").notNull(),
    payload: text("payload").notNull(),
  },
  (table) => [
    index("brief_runs_generated_at_idx").on(table.generatedAt),
  ],
);
