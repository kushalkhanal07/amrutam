# Scaling and performance

## Targets (from the assignment)

| Target | Value | Status |
|---|---|---|
| Daily consultations | 100,000 | design target |
| p95 read latency | < 200 ms | design target, **not yet measured** |
| p95 write latency | < 500 ms | design target, **not yet measured** |
| Availability | 99.95 % (≈ 22 min downtime/month) | design target |

No performance claim is made in this repository until the load test below has been executed and its
report committed.

## Back-of-the-envelope load

- 100k consultations/day → 1.2 bookings/s average. With a 10× peak factor: ~12 bookings/s.
- Each booking is preceded by ~10–20 reads (search, availability, profile): ~150–250 reads/s at peak.
- Each booking writes ~6 rows (slot update, consultation, payment, audit, 2 jobs) → ~70 writes/s peak.
- `audit_logs` growth: ~10 rows per consultation → 1 M rows/day → 365 M rows/year (the only table that needs a retention/partition plan in year one).

A single PostgreSQL instance of modest size (4 vCPU, 16 GB) comfortably sustains thousands of simple
indexed queries per second; this load is dominated by connection handling and I/O, not CPU.

## How the design scales

### Stateless API tier
- No in-process session state; JWTs are self-contained, refresh tokens live in the database.
- Horizontal scaling via ECS autoscaling (CPU target 60 %). Graceful shutdown drains in-flight requests.
- Known per-instance state: rate-limit counters and the notification worker. Both are safe with multiple
  instances (worker claims jobs with a conditional update); rate limits become per-instance and should
  be enforced at the load balancer / WAF beyond ~3 replicas (per-instance limits are then only a backstop).

### Database
- All hot paths are covered by composite indexes (`docs/erd.md`). Search is bounded (`limit ≤ 100`), sorted on
  indexed columns with a stable tie-breaker.
- Short transactions: the booking transaction holds one row lock for a few milliseconds.
- Connection pooling: Prisma's pool per instance (`connection_limit` in `DATABASE_URL`); with > 10
  instances add PgBouncer/RDS Proxy in transaction mode.
- Read replicas: analytics (`/admin/analytics/*`) and doctor search can be pointed at a replica
  (Prisma read-replica extension) once primary CPU exceeds ~60 %. Availability listing must stay on the
  primary (or accept a few hundred ms of staleness).

### Caching
Described in `architecture.md`: none today; public doctor search is the first candidate (in-process LRU, 30–60 s TTL,
invalidate on profile/verification change). Private/medical data is never cached.

### Partitioning: when it is actually needed
| Table | Growth | Plan |
|---|---|---|
| `audit_logs` | ~1 M rows/day | Range-partition by month once > ~100 M rows or when retention deletes take > minutes. Retention = `DROP PARTITION`. Queries already filter by `created_at`/`action`. |
| `payment_events`, `notification_jobs` | moderate | Same approach, later. Sent jobs can also simply be deleted after 30 days. |
| `consultations`, `payments` | 100 k/day → 36 M/year | Indexes suffice for years; partition by `scheduled_starts_at` year only if vacuum/bloat becomes an issue. |
| `availability_slots` | doctors × slots/day | Delete past AVAILABLE/BLOCKED slots after 90 days. |
| `users`, `doctors`, `prescriptions` | small | Never. |

PostgreSQL declarative partitioning requires the partition key in every unique index, so the partial
unique index on `consultations(slot_id)` is a reason to keep `consultations` unpartitioned.

### Asynchronous work
Notifications (and future PDF generation, reminders) are decoupled through the outbox table. If the
in-process poller becomes a bottleneck (> ~100 jobs/s), run the worker as a separate process with a larger batch size (`SELECT … FOR UPDATE SKIP LOCKED`)
without changing producers (they only insert rows / enqueue).

## Load-testing plan

Tool: [k6](https://k6.io) script at `load/k6-booking.js`.

1. Environment: dedicated staging stack mirroring production sizing; seeded with 500 doctors × 40 slots/day
   and 50 k patients (extend `prisma/seed.ts` or a dedicated generator).
2. Scenarios (run together):
   - **Reads:** search + availability at 50 → 500 req/s (ramp), tagged `kind:read`.
   - **Writes:** booking + cancel at 5 → 50 req/s, tagged `kind:write`, random slots so some requests
     legitimately conflict (409 is a correct outcome, not an error).
   - **Soak:** 60 minutes at the expected peak to catch connection leaks and job backlog.
3. Thresholds encoded in the script: `p(95) < 200 ms` reads, `p(95) < 500 ms` writes, `http_req_failed < 1 %`.
4. Observe during the run: Grafana dashboard (latency by route, 5xx ratio, DB up, event-loop lag),
   PostgreSQL `pg_stat_statements` top queries, lock waits, connection count, outbox lag
   (`select count(*) from notification_jobs where status='PENDING'`).
5. Record: k6 summary JSON (`--summary-export`), Grafana screenshots, DB metrics; commit under
   `load/results/<date>/` with the commit SHA and instance sizes.

```bash
k6 run -e BASE_URL=https://staging-api.example -e READ_RPS=200 -e BOOKING_RPS=20 -e DURATION=10m \
  --summary-export=load/results/$(date +%F)-summary.json load/k6-booking.js
```

## Results

_No load test has been executed yet. This section will hold measured p50/p95/p99 per route, error
ratio, throughput, and the environment description once a run has been performed._

## Availability (99.95 %)

- Two or more API tasks across two AZs; ALB health checks on `/ready`; rolling deploys with
  `minimumHealthyPercent=100`.
- RDS Multi-AZ with automatic failover; application reconnects (Prisma) after failover.
- Graceful shutdown + ALB deregistration delay (30 s) so deploys drop no requests.
- Dependencies that are allowed to fail without taking the API down: Stripe (payments pend), email (outbox
  retries), tracing exporter (fire-and-forget).
- Remaining single points of failure to address for 99.95 %: the region itself (see DR plan) and
  Stripe for *starting* consultations.
