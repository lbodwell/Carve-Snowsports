CREATE TABLE "draft_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"command_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"base_version" integer NOT NULL,
	"resulting_version" integer NOT NULL,
	"operation_type" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grouping_draft_assignments" (
	"draft_group_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"override_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grouping_draft_assignments_draft_group_id_registration_id_pk" PRIMARY KEY("draft_group_id","registration_id")
);
--> statement-breakpoint
CREATE TABLE "grouping_draft_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"discipline_id" uuid,
	"age_band_id" uuid,
	"ability_level_id" uuid,
	"lead_instructor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grouping_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'editing' NOT NULL,
	"rule_set_version" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "draft_operations" ADD CONSTRAINT "draft_operations_draft_id_grouping_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."grouping_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_operations" ADD CONSTRAINT "draft_operations_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_draft_assignments" ADD CONSTRAINT "grouping_draft_assignments_draft_group_id_grouping_draft_groups_id_fk" FOREIGN KEY ("draft_group_id") REFERENCES "public"."grouping_draft_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_draft_assignments" ADD CONSTRAINT "grouping_draft_assignments_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_draft_groups" ADD CONSTRAINT "grouping_draft_groups_draft_id_grouping_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."grouping_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_draft_groups" ADD CONSTRAINT "grouping_draft_groups_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_draft_groups" ADD CONSTRAINT "grouping_draft_groups_age_band_id_age_bands_id_fk" FOREIGN KEY ("age_band_id") REFERENCES "public"."age_bands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_draft_groups" ADD CONSTRAINT "grouping_draft_groups_ability_level_id_ability_levels_id_fk" FOREIGN KEY ("ability_level_id") REFERENCES "public"."ability_levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_draft_groups" ADD CONSTRAINT "grouping_draft_groups_lead_instructor_id_instructors_person_id_fk" FOREIGN KEY ("lead_instructor_id") REFERENCES "public"."instructors"("person_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_drafts" ADD CONSTRAINT "grouping_drafts_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_drafts" ADD CONSTRAINT "grouping_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "draft_operations_command_unique" ON "draft_operations" USING btree ("command_id");--> statement-breakpoint
CREATE INDEX "draft_operations_draft_version_index" ON "draft_operations" USING btree ("draft_id","resulting_version");--> statement-breakpoint
CREATE INDEX "grouping_draft_groups_draft_index" ON "grouping_draft_groups" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "grouping_drafts_program_status_index" ON "grouping_drafts" USING btree ("program_id","status");