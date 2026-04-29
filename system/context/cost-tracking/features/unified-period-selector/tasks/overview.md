Feature: Unified Period Selector — single layout-mounted period selector with one URL contract (`period`/`from`/`to`) propagating across every cost-tracking page that consumes time-bounded data
	RFC: /Users/mario/code/Labs/aimdall/system/rfcs/unified-period-selector.md
	- Add resolveSelectedPeriod domain function @type(backend) @agent(donnie) @status(done) @id(COST_4_1)
	- Extend use case input shapes for anomalies (additive startDate/endDate + displayed-list filter) and budget (accept optional dates) @type(backend) @agent(donnie) @status(done) @id(COST_4_2) @depends(COST_4_1)
	- Mount PeriodSelector in cost-tracking layout and preserve searchParams across NavigationContainer @type(frontend-smart) @agent(nexus) @status(done) @id(COST_4_3) @depends(COST_4_1)
	- Replace PeriodSelector skeleton with styled JSX (dropdown + custom date inputs) @type(frontend-ui) @agent(frankie) @status(done) @id(COST_4_4) @depends(COST_4_3)
	- Migrate dashboard page to consume resolver and fix unfilled use case call sites @type(frontend-smart) @agent(nexus) @status(done) @id(COST_4_5) @depends(COST_4_3, COST_4_2)
	- Migrate alerts page from window to resolved period (anomalies dual-mode) @type(frontend-smart) @agent(nexus) @status(done) @id(COST_4_6) @depends(COST_4_3, COST_4_2)
	- Migrate explore page from time to period and delete local resolveTimePreset @type(frontend-smart) @agent(nexus) @status(done) @id(COST_4_7) @depends(COST_4_3, COST_4_1)
	- Migrate attributions and budget pages and delete DateRangeFilter/DateRangeFilterContainer @type(frontend-smart) @agent(nexus) @status(done) @id(COST_4_8) @depends(COST_4_5, COST_4_6, COST_4_7)
	- Scenario coverage for resolver, anomalies dual-mode, and page-to-page URL propagation @type(other) @agent(tesseract) @status(done) @id(COST_4_9) @depends(COST_4_8)
