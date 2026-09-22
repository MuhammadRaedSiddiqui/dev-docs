const startedAt = Date.now();
let requestsTotal = 0;
let activeRequests = 0;
let requestDurationMsTotal = 0;
let serverErrorsTotal = 0;

export function beginRequest(): () => void {
  requestsTotal += 1;
  activeRequests += 1;
  const start = performance.now();
  return () => {
    activeRequests -= 1;
    requestDurationMsTotal += performance.now() - start;
  };
}

export function recordServerError(): void {
  serverErrorsTotal += 1;
}

export function renderMetrics(): string {
  const uptimeSeconds = (Date.now() - startedAt) / 1_000;
  return [
    '# HELP devdocs_uptime_seconds Process uptime in seconds.',
    '# TYPE devdocs_uptime_seconds gauge',
    `devdocs_uptime_seconds ${uptimeSeconds.toFixed(3)}`,
    '# HELP devdocs_http_requests_total HTTP requests received.',
    '# TYPE devdocs_http_requests_total counter',
    `devdocs_http_requests_total ${requestsTotal}`,
    '# HELP devdocs_http_active_requests Requests currently in flight.',
    '# TYPE devdocs_http_active_requests gauge',
    `devdocs_http_active_requests ${activeRequests}`,
    '# HELP devdocs_http_request_duration_milliseconds_total Cumulative request duration.',
    '# TYPE devdocs_http_request_duration_milliseconds_total counter',
    `devdocs_http_request_duration_milliseconds_total ${requestDurationMsTotal.toFixed(3)}`,
    '# HELP devdocs_http_server_errors_total Unhandled HTTP server errors.',
    '# TYPE devdocs_http_server_errors_total counter',
    `devdocs_http_server_errors_total ${serverErrorsTotal}`,
    '',
  ].join('\n');
}
