import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const briefRuns = sqliteTable(
  "brief_runs",
  {
    runId: text("run_id").primaryKey(),
    cadence: text("cadence", {
      enum: ["daily", "weekly"],
    }).notNull().default("weekly"),
    issueDate: text("issue_date").notNull(),
    generatedAt: text("generated_at").notNull(),
    publishedAt: text("published_at").notNull(),
    updatedAt: text("updated_at").notNull().default(""),
    sourceHealth: text("source_health").notNull(),
    payloadHash: text("payload_hash").notNull().default(""),
    payload: text("payload").notNull(),
  },
  (table) => [
    uniqueIndex("brief_runs_cadence_issue_date_uidx").on(
      table.cadence,
      table.issueDate,
    ),
    index("brief_runs_cadence_issue_date_idx").on(
      table.cadence,
      table.issueDate,
    ),
  ],
);

export const emailDeliveries = sqliteTable(
  "email_deliveries",
  {
    deliveryKey: text("delivery_key").primaryKey(),
    runId: text("run_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: text("status", {
      enum: ["pending", "sending", "sent", "failed"],
    }).notNull(),
    provider: text("provider").notNull().default("resend"),
    providerMessageId: text("provider_message_id"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: text("last_attempt_at"),
    sentAt: text("sent_at"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("email_deliveries_run_id_uidx").on(table.runId),
    index("email_deliveries_status_idx").on(table.status),
  ],
);
