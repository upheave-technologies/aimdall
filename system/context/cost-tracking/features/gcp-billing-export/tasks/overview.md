Feature: GCP Billing Export → BigQuery Provider — authoritative AI dollars from Cloud Billing Export, with per-key allocation derived against Cloud Monitoring; phased delivery (P1 = authoritative dollars only, P2 = per-key allocation + transitions + labels, P3 = SKU mapping + Other buckets + report-SKU affordance).
	PRD: /Users/mario/code/Labs/aimdall/system/context/cost-tracking/features/gcp-billing-export/prd.md
	RFC: /Users/mario/code/Labs/aimdall/system/context/cost-tracking/features/gcp-billing-export/rfc.md

	Phase 1 — Authoritative dollars (P0)
	- Add Phase 1 columns to cost_tracking_usage_records and create cost_tracking_gcp_sku_mappings table @type(database) @agent(archie) @status(pending) @id(GCPBE_5_1)
	- Add @google-cloud/bigquery dependency, gcp_billing_export provider slug, and DB-backed client construction branch @type(backend) @agent(donnie) @status(pending) @id(GCPBE_5_2) @depends(GCPBE_5_1)
	- Implement gcpBillingExportClient (auto export-start-date discovery, mandatory partition + AI-service filters, dry-run gate at 1 GiB ceiling, sync window with 3-day overlap, error mapping) @type(backend) @agent(donnie) @status(pending) @id(GCPBE_5_3) @depends(GCPBE_5_2)
	- Wire billed-row dedup key, ingestion mapping, and read-time Monitoring-estimate suppression predicate @type(backend) @agent(donnie) @status(pending) @id(GCPBE_5_4) @depends(GCPBE_5_3)
	- Server actions: connect, test connection, sync now, and pending_first_data lifecycle for google_billing_export @type(frontend-smart) @agent(nexus) @status(pending) @id(GCPBE_5_5) @depends(GCPBE_5_4)
	- GCP Billing Export connection wizard step (Detailed Export explainer, historical-data acknowledgement, validation feedback) @type(frontend-ui) @agent(frankie) @status(pending) @id(GCPBE_5_6) @depends(GCPBE_5_5)
	- Per-source freshness indicator + provenance badge on cost-tracking dashboards (Phase 1 surfaces) @type(frontend-ui) @agent(frankie) @status(pending) @id(GCPBE_5_7) @depends(GCPBE_5_5)

	Phase 2 — Per-key allocation, transitions, labels (deferable)
	- Add labels JSONB column to cost_tracking_usage_records and ingest labels in billing client @type(database) @agent(archie) @status(pending) @id(GCPBE_5_8) @depends(GCPBE_5_1)
	- Implement computePerKeyCostAllocationUseCase with Unattributed bucket and empty-state signal @type(backend) @agent(donnie) @status(pending) @id(GCPBE_5_9) @depends(GCPBE_5_4, GCPBE_5_8)
	- Per-key dashboard data layer (server components + actions) consuming allocation use case, plus transition banner state @type(frontend-smart) @agent(nexus) @status(pending) @id(GCPBE_5_10) @depends(GCPBE_5_9)
	- Per-key UI: estimated tooltip on every per-key dollar, Unattributed row, Billing-after-Monitoring delta banner, Monitoring-after-Billing celebratory highlight, Cloud Monitoring soft-prompt for Billing Export @type(frontend-ui) @agent(frankie) @status(pending) @id(GCPBE_5_11) @depends(GCPBE_5_10)

	Phase 3 — SKU mapping + Other buckets (deferable)
	- Seed cost_tracking_gcp_sku_mappings with full canonical-model mappings and add DrizzleGcpSkuMappingRepository wiring into allocation use case @type(backend) @agent(donnie) @status(pending) @id(GCPBE_5_12) @depends(GCPBE_5_9)
	- UI: Other Vertex / Other AI Studio buckets with "report unrecognized SKU" affordance @type(frontend-ui) @agent(frankie) @status(pending) @id(GCPBE_5_13) @depends(GCPBE_5_12, GCPBE_5_11)
