CREATE TYPE "public"."cost_tracking_attribution_dimension" AS ENUM('credential', 'segment', 'provider', 'model', 'model_slug', 'service_category', 'service_tier', 'region', 'metadata_key');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_attribution_match_type" AS ENUM('exact', 'prefix', 'regex', 'in_list');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_bucket_width" AS ENUM('1m', '1h', '1d');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_budget_period_type" AS ENUM('daily', 'weekly', 'monthly', 'quarterly', 'annual', 'custom');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_budget_status" AS ENUM('active', 'paused', 'exceeded', 'archived');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_budget_type" AS ENUM('hard_limit', 'soft_alert', 'tracking_only');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_cost_source" AS ENUM('provider_reported', 'calculated', 'estimated', 'none');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_credential_status" AS ENUM('active', 'revoked', 'expired', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_credential_type" AS ENUM('admin_api_key', 'api_key', 'service_account', 'iam_role', 'oauth_token', 'other');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_group_type" AS ENUM('team', 'department', 'project', 'environment', 'cost_center', 'business_unit', 'custom');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_model_status" AS ENUM('available', 'deprecated', 'retired');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_provider_status" AS ENUM('active', 'paused', 'error');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_segment_type" AS ENUM('organization', 'workspace', 'project', 'folder', 'account', 'organizational_unit', 'other');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_service_category" AS ENUM('text_generation', 'embedding', 'image_generation', 'audio_speech', 'audio_transcription', 'moderation', 'video_generation', 'code_execution', 'vector_storage', 'web_search', 'reranking', 'other');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_sync_status" AS ENUM('pending', 'running', 'completed', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."cost_tracking_sync_type" AS ENUM('full', 'incremental', 'backfill');--> statement-breakpoint
CREATE TABLE "cost_tracking_attribution_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"group_type" "cost_tracking_group_type" NOT NULL,
	"parent_id" text,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cost_tracking_attribution_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"dimension" "cost_tracking_attribution_dimension" NOT NULL,
	"match_type" "cost_tracking_attribution_match_type" NOT NULL,
	"match_value" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cost_tracking_budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scope" jsonb NOT NULL,
	"budget_type" "cost_tracking_budget_type" NOT NULL,
	"period_type" "cost_tracking_budget_period_type" NOT NULL,
	"amount" numeric(16, 8) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"alert_thresholds" jsonb,
	"current_spend" numeric(16, 8) DEFAULT '0' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"status" "cost_tracking_budget_status" DEFAULT 'active' NOT NULL,
	"last_evaluated_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cost_tracking_model_pricing" (
	"id" text PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"service_tier" text DEFAULT 'on_demand' NOT NULL,
	"context_tier" text,
	"region" text,
	"rates" jsonb NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"source" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_tracking_models" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"service_category" "cost_tracking_service_category" NOT NULL,
	"status" "cost_tracking_model_status" DEFAULT 'available' NOT NULL,
	"capabilities" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_tracking_provider_costs" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"segment_id" text,
	"model_slug" text,
	"cost_type" text NOT NULL,
	"token_type" text,
	"service_tier" text,
	"context_tier" text,
	"region" text,
	"bucket_start" timestamp with time zone NOT NULL,
	"bucket_end" timestamp with time zone NOT NULL,
	"amount" numeric(16, 8) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"description" text,
	"dedup_key" text NOT NULL,
	"sync_id" text,
	"provider_metadata" jsonb,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cost_tracking_provider_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"segment_id" text,
	"external_id" text NOT NULL,
	"label" text NOT NULL,
	"key_hint" text,
	"credential_type" "cost_tracking_credential_type" NOT NULL,
	"status" "cost_tracking_credential_status" DEFAULT 'active' NOT NULL,
	"is_sync_credential" boolean DEFAULT false NOT NULL,
	"scopes" jsonb,
	"last_used_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cost_tracking_provider_segments" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"external_id" text NOT NULL,
	"display_name" text NOT NULL,
	"segment_type" "cost_tracking_segment_type" NOT NULL,
	"parent_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cost_tracking_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"api_base_url" text,
	"status" "cost_tracking_provider_status" DEFAULT 'active' NOT NULL,
	"configuration" jsonb,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cost_tracking_sync_cursors" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"credential_id" text,
	"service_category" "cost_tracking_service_category" NOT NULL,
	"last_synced_bucket" timestamp with time zone NOT NULL,
	"last_page_token" text,
	"metadata" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_tracking_sync_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"credential_id" text,
	"sync_type" "cost_tracking_sync_type" NOT NULL,
	"status" "cost_tracking_sync_status" DEFAULT 'pending' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"records_fetched" integer DEFAULT 0 NOT NULL,
	"records_created" integer DEFAULT 0 NOT NULL,
	"records_updated" integer DEFAULT 0 NOT NULL,
	"records_skipped" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"error_details" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_tracking_usage_records" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"credential_id" text,
	"segment_id" text,
	"model_id" text,
	"model_slug" text NOT NULL,
	"service_category" "cost_tracking_service_category" NOT NULL,
	"service_tier" text,
	"context_tier" text,
	"region" text,
	"bucket_start" timestamp with time zone NOT NULL,
	"bucket_end" timestamp with time zone NOT NULL,
	"bucket_width" "cost_tracking_bucket_width" NOT NULL,
	"input_tokens" bigint,
	"output_tokens" bigint,
	"cached_input_tokens" bigint,
	"cache_write_tokens" bigint,
	"thinking_tokens" bigint,
	"audio_input_tokens" bigint,
	"audio_output_tokens" bigint,
	"image_count" integer,
	"character_count" integer,
	"duration_seconds" numeric(12, 3),
	"storage_bytes" bigint,
	"session_count" integer,
	"search_count" integer,
	"request_count" integer,
	"calculated_cost_amount" numeric(16, 8),
	"calculated_cost_currency" text DEFAULT 'USD',
	"cost_source" "cost_tracking_cost_source" DEFAULT 'calculated' NOT NULL,
	"provider_metadata" jsonb,
	"sync_id" text,
	"dedup_key" text NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "cost_tracking_attribution_rules" ADD CONSTRAINT "cost_tracking_attribution_rules_group_id_cost_tracking_attribution_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."cost_tracking_attribution_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_model_pricing" ADD CONSTRAINT "cost_tracking_model_pricing_model_id_cost_tracking_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."cost_tracking_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_models" ADD CONSTRAINT "cost_tracking_models_provider_id_cost_tracking_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."cost_tracking_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_provider_costs" ADD CONSTRAINT "cost_tracking_provider_costs_provider_id_cost_tracking_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."cost_tracking_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_provider_costs" ADD CONSTRAINT "cost_tracking_provider_costs_segment_id_cost_tracking_provider_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."cost_tracking_provider_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_provider_costs" ADD CONSTRAINT "cost_tracking_provider_costs_sync_id_cost_tracking_sync_logs_id_fk" FOREIGN KEY ("sync_id") REFERENCES "public"."cost_tracking_sync_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_provider_credentials" ADD CONSTRAINT "cost_tracking_provider_credentials_provider_id_cost_tracking_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."cost_tracking_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_provider_credentials" ADD CONSTRAINT "cost_tracking_provider_credentials_segment_id_cost_tracking_provider_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."cost_tracking_provider_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_provider_segments" ADD CONSTRAINT "cost_tracking_provider_segments_provider_id_cost_tracking_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."cost_tracking_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_sync_cursors" ADD CONSTRAINT "cost_tracking_sync_cursors_provider_id_cost_tracking_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."cost_tracking_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_sync_cursors" ADD CONSTRAINT "cost_tracking_sync_cursors_credential_id_cost_tracking_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."cost_tracking_provider_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_sync_logs" ADD CONSTRAINT "cost_tracking_sync_logs_provider_id_cost_tracking_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."cost_tracking_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_sync_logs" ADD CONSTRAINT "cost_tracking_sync_logs_credential_id_cost_tracking_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."cost_tracking_provider_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_usage_records" ADD CONSTRAINT "cost_tracking_usage_records_provider_id_cost_tracking_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."cost_tracking_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_usage_records" ADD CONSTRAINT "cost_tracking_usage_records_credential_id_cost_tracking_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."cost_tracking_provider_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_usage_records" ADD CONSTRAINT "cost_tracking_usage_records_segment_id_cost_tracking_provider_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."cost_tracking_provider_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_usage_records" ADD CONSTRAINT "cost_tracking_usage_records_model_id_cost_tracking_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."cost_tracking_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_tracking_usage_records" ADD CONSTRAINT "cost_tracking_usage_records_sync_id_cost_tracking_sync_logs_id_fk" FOREIGN KEY ("sync_id") REFERENCES "public"."cost_tracking_sync_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cost_tracking_attribution_groups_slug_unique_active" ON "cost_tracking_attribution_groups" USING btree ("slug") WHERE "cost_tracking_attribution_groups"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "cost_tracking_attribution_groups_group_type_idx" ON "cost_tracking_attribution_groups" USING btree ("group_type");--> statement-breakpoint
CREATE INDEX "cost_tracking_attribution_groups_parent_id_idx" ON "cost_tracking_attribution_groups" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_attribution_groups_deleted_at_idx" ON "cost_tracking_attribution_groups" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_tracking_attribution_rules_combo_unique_active" ON "cost_tracking_attribution_rules" USING btree ("group_id","dimension","match_type","match_value") WHERE "cost_tracking_attribution_rules"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "cost_tracking_attribution_rules_group_id_idx" ON "cost_tracking_attribution_rules" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_attribution_rules_dimension_idx" ON "cost_tracking_attribution_rules" USING btree ("dimension");--> statement-breakpoint
CREATE INDEX "cost_tracking_attribution_rules_deleted_at_idx" ON "cost_tracking_attribution_rules" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cost_tracking_budgets_status_idx" ON "cost_tracking_budgets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cost_tracking_budgets_budget_type_idx" ON "cost_tracking_budgets" USING btree ("budget_type");--> statement-breakpoint
CREATE INDEX "cost_tracking_budgets_deleted_at_idx" ON "cost_tracking_budgets" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_tracking_model_pricing_combo_unique" ON "cost_tracking_model_pricing" USING btree ("model_id","effective_from","service_tier","context_tier","region");--> statement-breakpoint
CREATE INDEX "cost_tracking_model_pricing_model_id_idx" ON "cost_tracking_model_pricing" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_model_pricing_effective_range_idx" ON "cost_tracking_model_pricing" USING btree ("effective_from","effective_to");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_tracking_models_provider_slug_unique" ON "cost_tracking_models" USING btree ("provider_id","slug");--> statement-breakpoint
CREATE INDEX "cost_tracking_models_provider_id_idx" ON "cost_tracking_models" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_models_service_category_idx" ON "cost_tracking_models" USING btree ("service_category");--> statement-breakpoint
CREATE INDEX "cost_tracking_models_status_idx" ON "cost_tracking_models" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_tracking_provider_costs_dedup_key_unique_active" ON "cost_tracking_provider_costs" USING btree ("dedup_key") WHERE "cost_tracking_provider_costs"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "cost_tracking_provider_costs_provider_id_idx" ON "cost_tracking_provider_costs" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_provider_costs_segment_id_idx" ON "cost_tracking_provider_costs" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_provider_costs_bucket_start_idx" ON "cost_tracking_provider_costs" USING btree ("bucket_start");--> statement-breakpoint
CREATE INDEX "cost_tracking_provider_costs_cost_type_idx" ON "cost_tracking_provider_costs" USING btree ("cost_type");--> statement-breakpoint
CREATE INDEX "cost_tracking_provider_costs_deleted_at_idx" ON "cost_tracking_provider_costs" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_tracking_provider_credentials_provider_external_unique_active" ON "cost_tracking_provider_credentials" USING btree ("provider_id","external_id") WHERE "cost_tracking_provider_credentials"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "cost_tracking_provider_credentials_provider_id_idx" ON "cost_tracking_provider_credentials" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_provider_credentials_segment_id_idx" ON "cost_tracking_provider_credentials" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_provider_credentials_status_idx" ON "cost_tracking_provider_credentials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cost_tracking_provider_credentials_credential_type_idx" ON "cost_tracking_provider_credentials" USING btree ("credential_type");--> statement-breakpoint
CREATE INDEX "cost_tracking_provider_credentials_deleted_at_idx" ON "cost_tracking_provider_credentials" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_tracking_provider_segments_provider_external_unique_active" ON "cost_tracking_provider_segments" USING btree ("provider_id","external_id") WHERE "cost_tracking_provider_segments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "cost_tracking_provider_segments_provider_id_idx" ON "cost_tracking_provider_segments" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_provider_segments_parent_id_idx" ON "cost_tracking_provider_segments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_provider_segments_segment_type_idx" ON "cost_tracking_provider_segments" USING btree ("segment_type");--> statement-breakpoint
CREATE INDEX "cost_tracking_provider_segments_deleted_at_idx" ON "cost_tracking_provider_segments" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_tracking_providers_slug_unique_active" ON "cost_tracking_providers" USING btree ("slug") WHERE "cost_tracking_providers"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "cost_tracking_providers_status_idx" ON "cost_tracking_providers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cost_tracking_providers_deleted_at_idx" ON "cost_tracking_providers" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_tracking_sync_cursors_combo_unique" ON "cost_tracking_sync_cursors" USING btree ("provider_id","credential_id","service_category");--> statement-breakpoint
CREATE INDEX "cost_tracking_sync_cursors_provider_id_idx" ON "cost_tracking_sync_cursors" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_sync_logs_provider_id_idx" ON "cost_tracking_sync_logs" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_sync_logs_credential_id_idx" ON "cost_tracking_sync_logs" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_sync_logs_status_idx" ON "cost_tracking_sync_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cost_tracking_sync_logs_started_at_idx" ON "cost_tracking_sync_logs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_tracking_usage_records_dedup_key_unique_active" ON "cost_tracking_usage_records" USING btree ("dedup_key") WHERE "cost_tracking_usage_records"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "cost_tracking_usage_records_provider_id_idx" ON "cost_tracking_usage_records" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_usage_records_credential_id_idx" ON "cost_tracking_usage_records" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_usage_records_segment_id_idx" ON "cost_tracking_usage_records" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_usage_records_model_id_idx" ON "cost_tracking_usage_records" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_usage_records_model_slug_idx" ON "cost_tracking_usage_records" USING btree ("model_slug");--> statement-breakpoint
CREATE INDEX "cost_tracking_usage_records_service_category_idx" ON "cost_tracking_usage_records" USING btree ("service_category");--> statement-breakpoint
CREATE INDEX "cost_tracking_usage_records_bucket_start_idx" ON "cost_tracking_usage_records" USING btree ("bucket_start");--> statement-breakpoint
CREATE INDEX "cost_tracking_usage_records_bucket_range_idx" ON "cost_tracking_usage_records" USING btree ("bucket_start","bucket_end");--> statement-breakpoint
CREATE INDEX "cost_tracking_usage_records_sync_id_idx" ON "cost_tracking_usage_records" USING btree ("sync_id");--> statement-breakpoint
CREATE INDEX "cost_tracking_usage_records_deleted_at_idx" ON "cost_tracking_usage_records" USING btree ("deleted_at");