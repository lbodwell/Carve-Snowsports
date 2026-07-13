ALTER TABLE "instructor_qualifications" DROP CONSTRAINT "instructor_qualifications_instructor_id_discipline_id_ability_level_id_pk";--> statement-breakpoint
ALTER TABLE "instructor_qualifications" ADD CONSTRAINT "instructor_qualifications_instructor_id_discipline_id_pk" PRIMARY KEY("instructor_id","discipline_id");--> statement-breakpoint
ALTER TABLE "group_revisions" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "instructors" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "notes" text;