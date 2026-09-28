ALTER TABLE "import_batches" ADD COLUMN "workflow_run_id" varchar(255);--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "workflow_phase" varchar(64);--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "failure_code" varchar(100);--> statement-breakpoint
ALTER TABLE "import_files" ADD COLUMN "storage_key" varchar(500);