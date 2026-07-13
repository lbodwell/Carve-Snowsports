CREATE TABLE "group_revision_memberships" (
	"group_revision_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_revision_memberships_group_revision_id_student_id_pk" PRIMARY KEY("group_revision_id","student_id"),
	CONSTRAINT "group_revision_memberships_effective_range_check" CHECK ("group_revision_memberships"."effective_until" is null or "group_revision_memberships"."effective_until" >= "group_revision_memberships"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "group_revision_memberships" ADD CONSTRAINT "group_revision_memberships_group_revision_id_group_revisions_id_fk" FOREIGN KEY ("group_revision_id") REFERENCES "public"."group_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_revision_memberships" ADD CONSTRAINT "group_revision_memberships_student_id_students_person_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("person_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_revision_memberships" ADD CONSTRAINT "group_revision_memberships_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_revision_memberships_student_index" ON "group_revision_memberships" USING btree ("student_id");