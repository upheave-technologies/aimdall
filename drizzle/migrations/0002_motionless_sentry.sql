ALTER TYPE "public"."cost_tracking_group_type" ADD VALUE 'user' BEFORE 'custom';--> statement-breakpoint
ALTER TABLE "cost_tracking_attribution_groups" ADD COLUMN "linked_entity_type" text;--> statement-breakpoint
ALTER TABLE "cost_tracking_attribution_groups" ADD COLUMN "linked_entity_id" text;--> statement-breakpoint
CREATE INDEX "cost_tracking_attribution_groups_linked_entity_idx" ON "cost_tracking_attribution_groups" USING btree ("linked_entity_type","linked_entity_id") WHERE "cost_tracking_attribution_groups"."deleted_at" is null;