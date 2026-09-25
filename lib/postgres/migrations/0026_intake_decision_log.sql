ALTER TABLE "articleFeedback" ADD COLUMN "decision_log" jsonb;--> statement-breakpoint
ALTER TABLE "siteFeedback" ADD COLUMN "decision_log" jsonb;--> statement-breakpoint
ALTER TABLE "tripReportSubmissions" ADD COLUMN "decision_log" jsonb;