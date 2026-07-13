ALTER TABLE "accounts" DROP CONSTRAINT "accounts_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_actor_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "draft_operations" DROP CONSTRAINT "draft_operations_actor_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "grouping_drafts" DROP CONSTRAINT "grouping_drafts_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "import_batches" DROP CONSTRAINT "import_batches_uploaded_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "instructors" DROP CONSTRAINT "instructors_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "lesson_attendance" DROP CONSTRAINT "lesson_attendance_recorded_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "organization_memberships" DROP CONSTRAINT "organization_memberships_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "actor_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "draft_operations" ALTER COLUMN "actor_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "grouping_drafts" ALTER COLUMN "created_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "import_batches" ALTER COLUMN "uploaded_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "instructors" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "lesson_attendance" ALTER COLUMN "recorded_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "organization_memberships" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "verifications" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "verifications" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_operations" ADD CONSTRAINT "draft_operations_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_drafts" ADD CONSTRAINT "grouping_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attendance" ADD CONSTRAINT "lesson_attendance_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;