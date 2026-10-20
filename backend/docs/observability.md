# Observability

## Logs (Pino via nestjs-pino)

- JSON lines in production (`LOG_LEVEL`, default `info`); pretty-printed in development.
- Every request log carries `requestId`. The id is taken from an incoming `X-Request-Id` header (≤128
  chars) or generated (UUID v4), and echoed back in the `X-Request-Id` response header. The same id is
  written to `audit_logs.request_id` and included in error envelopes, so a support ticket can be traced
  from the client through logs to the audit trail.
- Redaction: `authorization`, `cookie`, `stripe-signature`, `set-cookie`. Request/response bodies are not
  logged at all because they can contain medical data.
- `/health`, `/ready`, `/metrics` are excluded from access logs.
- Unexpected errors (5xx) are logged with stack traces by the exception filter; expected 4xx are not.

## Metrics (Prometheus, `GET /metrics`)

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `http_request_duration_seconds` | histogram (buckets 5 ms – 5 s) | `method`, `route`, `status_code` | Latency SLOs (p95 read/write) |
| `http_requests_total` | counter | `method`, `route`, `status_code` | Traffic, error ratio, booking outcomes (201 vs 409) |
| `http_request_errors_total` | counter | `method`, `route` | 5xx alerts |
| `db_up` | gauge | – | Set at scrape time from `SELECT 1` |
| `bookings_total`, `notification_jobs_processed_total` | counter | `result` / `outcome` | Business counters (hooks available for extension) |
| `amrutam_nodejs_*`, `amrutam_process_*` | default | – | Heap, event-loop lag, CPU, GC |

Routes are recorded as templates (`/doctors/:id/availability`), never concrete URLs, so cardinality stays
bounded. `docker compose --profile observability up` starts Prometheus (`observability/prometheus.yml`)
and Grafana with the provisioned dashboard `observability/grafana/dashboards/amrutam-api.json`
(request rate, 5xx ratio, DB up, bookings/h, p50/p95/p99, p95 by route, status codes, booking
outcomes, heap/event-loop, CPU).

Suggested alerts (Prometheus rules, not shipped):

```yaml
- alert: ApiHighErrorRatio
  expr: sum(rate(http_request_errors_total[5m])) / sum(rate(http_requests_total[5m])) > 0.01
  for: 5m
- alert: ApiP95LatencyHigh
  expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 0.5
  for: 10m
- alert: DatabaseDown
  expr: min(db_up) == 0
  for: 1m
```

## Traces (OpenTelemetry)

- `src/observability/tracing.ts` is the first import in `main.ts`. When
  `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set (e.g. `http://localhost:4318/v1/traces` for the Jaeger
  container), the Node SDK starts with auto-instrumentation for HTTP, Express, `pg` and the Prisma
  instrumentation, so each request trace contains the controller span and every database query with
  its model/operation. Without the variable, no SDK is started (zero overhead).
- Health/ready/metrics requests are not traced. The exporter has a 5 s timeout and never blocks requests.
- Trace context propagates over outbound HTTP (Stripe calls appear as child spans).

## Health

- `GET /health` – liveness; never touches dependencies (used by the container `HEALTHCHECK` and ECS).
- `GET /ready` – readiness via Terminus: database ping with a 2 s timeout (used by the load balancer).

## Graceful shutdown

`app.enableShutdownHooks()` + SIGTERM/SIGINT handlers: stop accepting connections, finish in-flight
requests, stop the notification poller, disconnect Prisma, flush the trace exporter, exit 0. The
Dockerfile uses `dumb-init` so the signal reaches Node, and the ALB deregistration delay (30 s) is
longer than the drain time.

## Runbook pointers

| Symptom | First look |
|---|---|
| p95 latency up on one route | Grafana "p95 by route" → trace in Jaeger for that route → `pg_stat_statements` |
| 409 spike on `POST /bookings` | Expected under contention; check whether a client retries without `Idempotency-Key` |
| `db_up` = 0 / `/ready` 503 | Database connectivity; check RDS events, security groups, connection count |
| Notifications not arriving | `select status, count(*) from notification_jobs group by 1`; look at `last_error` on FAILED |
| Payment stuck in PROCESSING | Stripe dashboard → event delivery for the webhook endpoint; replay from Stripe; `payment_events` shows what was received |
