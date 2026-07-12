CREATE TABLE "ability_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(100) NOT NULL,
	"numeric_rank" integer NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "age_bands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"label" varchar(100) NOT NULL,
	"minimum_age" integer NOT NULL,
	"maximum_age" integer NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "age_bands_range_check" CHECK ("age_bands"."maximum_age" >= "age_bands"."minimum_age" and "age_bands"."minimum_age" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" uuid,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"value" varchar(500) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_methods_kind_check" CHECK ("contact_methods"."kind" in ('email', 'phone'))
);
--> statement-breakpoint
CREATE TABLE "disciplines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(100) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" uuid NOT NULL,
	"source_system" varchar(100) NOT NULL,
	"external_id" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_recurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_revision_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"time_slot_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_recurrences_weekday_check" CHECK ("group_recurrences"."weekday" between 0 and 6)
);
--> statement-breakpoint
CREATE TABLE "group_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_group_id" uuid NOT NULL,
	"discipline_id" uuid,
	"ability_level_id" uuid,
	"age_band_id" uuid,
	"lead_instructor_id" uuid,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_revisions_effective_range_check" CHECK ("group_revisions"."effective_until" is null or "group_revisions"."effective_until" >= "group_revisions"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "instructor_qualifications" (
	"instructor_id" uuid NOT NULL,
	"discipline_id" uuid NOT NULL,
	"ability_level_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructor_qualifications_instructor_id_discipline_id_ability_level_id_pk" PRIMARY KEY("instructor_id","discipline_id","ability_level_id")
);
--> statement-breakpoint
CREATE TABLE "instructors" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_attendance" (
	"lesson_instance_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" varchar(32) NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_attendance_lesson_instance_id_student_id_pk" PRIMARY KEY("lesson_instance_id","student_id"),
	CONSTRAINT "lesson_attendance_status_check" CHECK ("lesson_attendance"."status" in ('present', 'absent', 'late', 'excused'))
);
--> statement-breakpoint
CREATE TABLE "lesson_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_revision_id" uuid NOT NULL,
	"lesson_date" date NOT NULL,
	"time_slot_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id"),
	CONSTRAINT "organization_memberships_role_check" CHECK ("organization_memberships"."role" in ('admin', 'coordinator', 'instructor'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"timezone" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"date_of_birth" date,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"discipline_id" uuid,
	"ability_level_id" uuid,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"source_snapshot" jsonb,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"group_number" integer NOT NULL,
	"status" varchar(32) DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_date_range_check" CHECK ("seasons"."ends_on" >= "seasons"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"relationship" varchar(100),
	"is_emergency_contact" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_guardians_student_id_guardian_id_pk" PRIMARY KEY("student_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"category" varchar(32) NOT NULL,
	"requires_review" boolean DEFAULT true NOT NULL,
	"restricted_note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_records_category_check" CHECK ("support_records"."category" in ('medication', 'food_allergy', 'drug_allergy', 'special_condition'))
);
--> statement-breakpoint
CREATE TABLE "time_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(100) NOT NULL,
	"starts_at" time NOT NULL,
	"ends_at" time NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_slots_range_check" CHECK ("time_slots"."ends_at" > "time_slots"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(200) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ability_levels" ADD CONSTRAINT "ability_levels_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "age_bands" ADD CONSTRAINT "age_bands_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_methods" ADD CONSTRAINT "contact_methods_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplines" ADD CONSTRAINT "disciplines_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_recurrences" ADD CONSTRAINT "group_recurrences_group_revision_id_group_revisions_id_fk" FOREIGN KEY ("group_revision_id") REFERENCES "public"."group_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_recurrences" ADD CONSTRAINT "group_recurrences_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_revisions" ADD CONSTRAINT "group_revisions_season_group_id_season_groups_id_fk" FOREIGN KEY ("season_group_id") REFERENCES "public"."season_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_revisions" ADD CONSTRAINT "group_revisions_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_revisions" ADD CONSTRAINT "group_revisions_ability_level_id_ability_levels_id_fk" FOREIGN KEY ("ability_level_id") REFERENCES "public"."ability_levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_revisions" ADD CONSTRAINT "group_revisions_age_band_id_age_bands_id_fk" FOREIGN KEY ("age_band_id") REFERENCES "public"."age_bands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_revisions" ADD CONSTRAINT "group_revisions_lead_instructor_id_instructors_person_id_fk" FOREIGN KEY ("lead_instructor_id") REFERENCES "public"."instructors"("person_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_qualifications" ADD CONSTRAINT "instructor_qualifications_instructor_id_instructors_person_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("person_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_qualifications" ADD CONSTRAINT "instructor_qualifications_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_qualifications" ADD CONSTRAINT "instructor_qualifications_ability_level_id_ability_levels_id_fk" FOREIGN KEY ("ability_level_id") REFERENCES "public"."ability_levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attendance" ADD CONSTRAINT "lesson_attendance_lesson_instance_id_lesson_instances_id_fk" FOREIGN KEY ("lesson_instance_id") REFERENCES "public"."lesson_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attendance" ADD CONSTRAINT "lesson_attendance_student_id_students_person_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("person_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attendance" ADD CONSTRAINT "lesson_attendance_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_instances" ADD CONSTRAINT "lesson_instances_group_revision_id_group_revisions_id_fk" FOREIGN KEY ("group_revision_id") REFERENCES "public"."group_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_instances" ADD CONSTRAINT "lesson_instances_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_student_id_students_person_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("person_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_ability_level_id_ability_levels_id_fk" FOREIGN KEY ("ability_level_id") REFERENCES "public"."ability_levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_groups" ADD CONSTRAINT "season_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_groups" ADD CONSTRAINT "season_groups_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_groups" ADD CONSTRAINT "season_groups_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_students_person_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("person_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_people_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_records" ADD CONSTRAINT "support_records_student_id_students_person_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("person_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ability_levels_program_key_unique" ON "ability_levels" USING btree ("program_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "ability_levels_program_rank_unique" ON "ability_levels" USING btree ("program_id","numeric_rank");--> statement-breakpoint
CREATE INDEX "audit_events_entity_index" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "contact_methods_person_index" ON "contact_methods" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disciplines_program_key_unique" ON "disciplines" USING btree ("program_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "external_identities_unique" ON "external_identities" USING btree ("organization_id","source_system","entity_type","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_recurrences_unique" ON "group_recurrences" USING btree ("group_revision_id","weekday","time_slot_id");--> statement-breakpoint
CREATE INDEX "group_revisions_group_effective_index" ON "group_revisions" USING btree ("season_group_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_instances_revision_date_slot_unique" ON "lesson_instances" USING btree ("group_revision_id","lesson_date","time_slot_id");--> statement-breakpoint
CREATE INDEX "lesson_instances_date_index" ON "lesson_instances" USING btree ("lesson_date","time_slot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_name_unique" ON "organizations" USING btree ("name");--> statement-breakpoint
CREATE INDEX "people_org_name_index" ON "people" USING btree ("organization_id","last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_season_name_unique" ON "programs" USING btree ("season_id","name");--> statement-breakpoint
CREATE INDEX "registrations_program_active_index" ON "registrations" USING btree ("program_id","status","archived_at");--> statement-breakpoint
CREATE INDEX "registrations_student_index" ON "registrations" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "season_groups_number_unique" ON "season_groups" USING btree ("organization_id","season_id","program_id","group_number");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_org_name_unique" ON "seasons" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "seasons_org_active_index" ON "seasons" USING btree ("organization_id","archived_at");--> statement-breakpoint
CREATE INDEX "support_records_student_active_index" ON "support_records" USING btree ("student_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "time_slots_program_key_unique" ON "time_slots" USING btree ("program_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");