CREATE TYPE "public"."identity_principal_status" AS ENUM('active', 'suspended', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."identity_principal_type" AS ENUM('human', 'agent', 'system');--> statement-breakpoint
CREATE TABLE "cost_tracking_key_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"principal_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_principals" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "identity_principal_type" NOT NULL,
	"status" "identity_principal_status" DEFAULT 'active' NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"metadata" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cost_tracking_key_assignments" ADD CONSTRAINT "cost_tracking_key_assignments_credential_id_cost_tracking_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."cost_tracking_provider_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cost_tracking_key_assignments_principal_credential_unique_active" ON "cost_tracking_key_assignments" USING btree ("principal_id","credential_id") WHERE "cost_tracking_key_assignments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "cost_tracking_key_assignments_principal_id_idx" ON "cost_tracking_key_assignments" USING btree ("principal_id") WHERE "cost_tracking_key_assignments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "cost_tracking_key_assignments_credential_id_idx" ON "cost_tracking_key_assignments" USING btree ("credential_id") WHERE "cost_tracking_key_assignments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "cost_tracking_key_assignments_deleted_at_idx" ON "cost_tracking_key_assignments" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_principals_email_unique_active" ON "identity_principals" USING btree ("email") WHERE "identity_principals"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "identity_principals_type_idx" ON "identity_principals" USING btree ("type");--> statement-breakpoint
CREATE INDEX "identity_principals_status_idx" ON "identity_principals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "identity_principals_deleted_at_idx" ON "identity_principals" USING btree ("deleted_at");