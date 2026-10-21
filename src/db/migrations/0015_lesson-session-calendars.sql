ALTER TABLE "time_slots" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "time_slots" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "time_slots" ADD COLUMN "excluded_dates" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "time_slots" ADD COLUMN "cohort" varchar(20) DEFAULT 'season' NOT NULL;--> statement-breakpoint
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_cohort_check" CHECK ("time_slots"."cohort" in ('season', 'session-1', 'session-2'));--> statement-breakpoint
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_dates_check" CHECK (("time_slots"."starts_on" is null and "time_slots"."ends_on" is null) or ("time_slots"."starts_on" is not null and "time_slots"."ends_on" is not null and "time_slots"."ends_on" >= "time_slots"."starts_on"));