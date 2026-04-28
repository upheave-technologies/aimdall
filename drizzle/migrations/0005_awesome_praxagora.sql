CREATE TYPE "public"."cost_tracking_provider_sync_state" AS ENUM('idle', 'in_progress', 'success', 'error');--> statement-breakpoint
ALTER TABLE "cost_tracking_providers" ADD COLUMN "sync_state" "cost_tracking_provider_sync_state" DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "cost_tracking_providers" ADD COLUMN "sync_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cost_tracking_providers" ADD COLUMN "sync_error" text;--> statement-breakpoint
UPDATE "cost_tracking_providers" SET "sync_state" = 'success' WHERE "last_sync_at" IS NOT NULL;