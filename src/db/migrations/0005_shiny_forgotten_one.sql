CREATE TABLE "grouping_draft_instructors" (
	"draft_group_id" uuid NOT NULL,
	"instructor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grouping_draft_instructors_draft_group_id_instructor_id_pk" PRIMARY KEY("draft_group_id","instructor_id")
);
--> statement-breakpoint
ALTER TABLE "grouping_draft_assignments" ADD COLUMN "draft_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "grouping_draft_groups" ADD COLUMN "weekday" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "grouping_draft_groups" ADD COLUMN "time_slot_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "grouping_draft_groups" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "grouping_draft_instructors" ADD CONSTRAINT "grouping_draft_instructors_draft_group_id_grouping_draft_groups_id_fk" FOREIGN KEY ("draft_group_id") REFERENCES "public"."grouping_draft_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_draft_instructors" ADD CONSTRAINT "grouping_draft_instructors_instructor_id_instructors_person_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("person_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_draft_assignments" ADD CONSTRAINT "grouping_draft_assignments_draft_id_grouping_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."grouping_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_draft_groups" ADD CONSTRAINT "grouping_draft_groups_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "grouping_draft_assignments_draft_registration_unique" ON "grouping_draft_assignments" USING btree ("draft_id","registration_id");--> statement-breakpoint
ALTER TABLE "grouping_draft_groups" ADD CONSTRAINT "grouping_draft_groups_weekday_check" CHECK ("grouping_draft_groups"."weekday" between 0 and 6);