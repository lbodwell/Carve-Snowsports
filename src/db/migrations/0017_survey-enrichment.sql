ALTER TABLE "support_records" ADD COLUMN "source_response_id" uuid;--> statement-breakpoint
ALTER TABLE "support_records" ADD COLUMN "source_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD COLUMN "enrichment_issues" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "support_records" ADD CONSTRAINT "support_records_source_response_id_unique" UNIQUE("source_response_id");