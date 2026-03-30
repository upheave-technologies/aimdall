Feature: Cost Explorer — URL-driven, server-side cost analytics with unrestricted dimension grouping/filtering, context-adaptive metrics, time-series visualization, and drill-down
	RFC: system/context/cost-tracking/features/cost-explorer/rfc.md
	PRD: system/context/cost-tracking/features/cost-explorer/prd.md
	- Define explorer domain types and context-adaptive metric selection function @type(backend) @agent(donnie) @status(pending) @id(COST_3_1)
	- Implement parameterized aggregation repository method with time-series query @type(backend) @agent(donnie) @status(pending) @id(COST_3_2) @depends(COST_3_1)
	- Implement explore cost data use case @type(backend) @agent(donnie) @status(pending) @id(COST_3_3) @depends(COST_3_2)
	- Create explorer page server component with URL-driven state @type(frontend-smart) @agent(nexus) @status(pending) @id(COST_3_4) @depends(COST_3_3)
	- Implement filter value population server action @type(frontend-smart) @agent(nexus) @status(pending) @id(COST_3_5) @depends(COST_3_3)
	- Build explorer interactive client components (grouping selector, filter bar, pagination, drill-down) @type(frontend-ui) @agent(frankie) @status(pending) @id(COST_3_6) @depends(COST_3_4, COST_3_5)
	- Build explorer presentational components (summary headline, result table, time-series chart, empty state) @type(frontend-ui) @agent(frankie) @status(pending) @id(COST_3_7) @depends(COST_3_4, COST_3_6)
