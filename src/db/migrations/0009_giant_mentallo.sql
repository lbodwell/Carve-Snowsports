CREATE TABLE "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"role" varchar(32) NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by_user_id" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_invitations_role_check" CHECK ("organization_invitations"."role" in ('admin', 'coordinator', 'instructor')),
	CONSTRAINT "organization_invitations_status_check" CHECK ("organization_invitations"."status" in ('pending', 'accepted', 'cancelled', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_invitations_org_status_index" ON "organization_invitations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitations_pending_email_unique" ON "organization_invitations" USING btree ("organization_id","email") WHERE "organization_invitations"."status" = 'pending';