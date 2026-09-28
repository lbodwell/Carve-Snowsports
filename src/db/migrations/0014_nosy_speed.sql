CREATE TABLE "survey_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"token" varchar(128) NOT NULL,
	"last_opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"invitation_id" uuid,
	"answers" jsonb NOT NULL,
	"child_first_name" varchar(100) NOT NULL,
	"child_last_name" varchar(100) NOT NULL,
	"child_date_of_birth" date NOT NULL,
	"match_status" varchar(32) DEFAULT 'unmatched' NOT NULL,
	"suggested_student_id" uuid,
	"confirmed_student_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "survey_responses_match_status_check" CHECK ("survey_responses"."match_status" in ('unmatched', 'unique', 'ambiguous'))
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" varchar(100) NOT NULL,
	"title" varchar(200) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"definition_key" varchar(100) NOT NULL,
	"definition_version" integer DEFAULT 1 NOT NULL,
	"allow_anonymous" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surveys_status_check" CHECK ("surveys"."status" in ('draft', 'open', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "survey_invitations" ADD CONSTRAINT "survey_invitations_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_invitation_id_survey_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."survey_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_suggested_student_id_students_person_id_fk" FOREIGN KEY ("suggested_student_id") REFERENCES "public"."students"("person_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_confirmed_student_id_students_person_id_fk" FOREIGN KEY ("confirmed_student_id") REFERENCES "public"."students"("person_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "survey_invitations_survey_email_unique" ON "survey_invitations" USING btree ("survey_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_invitations_token_unique" ON "survey_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "survey_responses_survey_submitted_index" ON "survey_responses" USING btree ("survey_id","submitted_at");--> statement-breakpoint
CREATE INDEX "survey_responses_suggested_student_index" ON "survey_responses" USING btree ("suggested_student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "surveys_slug_unique" ON "surveys" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "surveys_organization_status_index" ON "surveys" USING btree ("organization_id","status");