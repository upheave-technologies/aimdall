CREATE TYPE "public"."cost_tracking_recommendation_category" AS ENUM('model_tier_optimization', 'cache_utilization', 'batch_api_opportunity', 'dormant_credentials', 'context_tier_analysis', 'provider_concentration_risk');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_recommendation_status" AS ENUM('active', 'dismissed', 'expired');--> statement-breakpoint
CREATE TABLE "cost_tracking_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"category" "cost_tracking_recommendation_category" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"estimated_monthly_savings" numeric(16, 8),
	"savings_percentage" numeric(5, 2),
	"confidence_basis" text,
	"status" "cost_tracking_recommendation_status" DEFAULT 'active' NOT NULL,
	"data" jsonb,
	"dismissed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cost_tracking_suggestion_dismissals" (
	"id" text PRIMARY KEY NOT NULL,
	"suggestion_id" text NOT NULL,
	"suggestion_type" text NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cost_tracking_recommendations_status_idx" ON "cost_tracking_recommendations" USING btree ("status") WHERE "cost_tracking_recommendations"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "cost_tracking_recommendations_category_idx" ON "cost_tracking_recommendations" USING btree ("category") WHERE "cost_tracking_recommendations"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "cost_tracking_recommendations_deleted_at_idx" ON "cost_tracking_recommendations" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_tracking_suggestion_dismissals_suggestion_id_idx" ON "cost_tracking_suggestion_dismissals" USING btree ("suggestion_id");