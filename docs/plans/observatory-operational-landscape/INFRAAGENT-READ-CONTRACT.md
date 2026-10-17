# Supported InfraAgent read boundary

Status: Operational. Verified local source, production activation pending exact owner credentials and monitor binding.

The supported GET /api/v1/monitors/{id} route authenticates Authorization: Bearer <key> (or X-Api-Key). It accepts an existing read_only API key, applies organization context and current member/app permissions, and returns 404 when the monitor is missing or inaccessible. No mutation or trigger/run endpoint is needed.

Verified source paths in /home/urmani/Documents/Work/infra-agent:
- apps/dashboard/src/app/api/v1/monitors/[id]/route.ts, GET handler.
- apps/dashboard/src/server/public-api/auth.ts, authenticateApiKey, extractApiKey, canAccessApp.
- apps/dashboard/src/server/public-api/serialize.ts, serializeMonitor/serializeMonitorDetail.
- apps/dashboard/src/server/checks/engine.ts, check result status up/down/degraded.

Success shape: { success:true, monitor:{id,name,description,type,status,enabled,target,intervalSeconds,escalationSeconds,appId,lastCheckedAt,lastStatusChangedAt,createdAt,config,heartbeatUrl}, recentChecks:[{checkedAt,status,responseTimeMs,statusCode,error}], openIncident:{id,startedAt,cause,lastError,acknowledgedAt,escalationCount}|null }. The endpoint exposes the latest25 checks, not complete history. This is sufficient for a current observation; never label it complete monitor history. Monitor status is paused when disabled. Supported check result statuses are up, down and degraded; unknown/unreachable states cannot become passing. lastCheckedAt and checkedAt are observation times, not the fetch time. Acknowledgment is not recovery. Open incidents retain source identity across polls; actual resolved history is not supplied by this read and cannot be invented.

Security: monitor.config and heartbeatUrl can carry sensitive material. Preserve the original only through the server-private immutable observation path, never in a UI/MCP detail DTO, public error or logs. Derived detail uses explicit safe fields only, and does not expose config, heartbeatUrl, arbitrary target URLs or raw provider error bodies. The integration base URL and credential come from trusted server configuration outside the repository; request JSON cannot choose them. Disable redirect following and forward credentials only to the configured origin. Do not create/run/pause a real monitor or simulate a production outage.
