CREATE TABLE "registration_parties" (
	"registration_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" varchar(32) NOT NULL,
	"source_system" varchar(100) NOT NULL,
	"source_key" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_parties_registration_id_person_id_role_pk" PRIMARY KEY("registration_id","person_id","role")
);
--> statement-breakpoint
ALTER TABLE "registration_parties" ADD CONSTRAINT "registration_parties_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_parties" ADD CONSTRAINT "registration_parties_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;