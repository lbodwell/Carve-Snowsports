CREATE TABLE "import_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_kind" varchar(32) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"raw_hash" varchar(128) NOT NULL,
	"row_count" integer NOT NULL,
	"status" varchar(32) DEFAULT 'validated' NOT NULL,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_system" varchar(100) NOT NULL,
	"source_key" varchar(500) NOT NULL,
	"first_seen_batch_id" uuid,
	"last_seen_batch_id" uuid,
	"source_status" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "input_set_hash" varchar(128);--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "program_id" uuid;--> statement-breakpoint
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_sources" ADD CONSTRAINT "registration_sources_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_sources" ADD CONSTRAINT "registration_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_sources" ADD CONSTRAINT "registration_sources_first_seen_batch_id_import_batches_id_fk" FOREIGN KEY ("first_seen_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_sources" ADD CONSTRAINT "registration_sources_last_seen_batch_id_import_batches_id_fk" FOREIGN KEY ("last_seen_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_files_batch_source_unique" ON "import_files" USING btree ("batch_id","source_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_sources_unique" ON "registration_sources" USING btree ("organization_id","source_system","source_key");--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;