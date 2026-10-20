# Backup, restore and disaster recovery

## Objectives

| Scenario | RPO (max data loss) | RTO (max downtime) |
|---|---|---|
| Single API instance failure | 0 | < 1 min (load balancer + autoscaling replace it) |
| Database primary failure (Multi-AZ) | 0 (synchronous standby) | 1–3 min (automatic failover) |
| Logical corruption / bad migration / accidental delete | ≤ 5 min (point-in-time recovery) | ≤ 60 min |
| Loss of the whole region | ≤ 15 min (cross-region snapshot copy lag) | ≤ 4 h (manual promotion in DR region) |

These are **assumptions and targets** for the reference AWS deployment; they are not yet measured in a drill.

## What is backed up

| Data | Mechanism | Retention |
|---|---|---|
| PostgreSQL (all tables) | RDS automated daily snapshots + continuous WAL archiving (PITR) | 14 days |
| PostgreSQL (long-term) | Manual snapshot copied cross-region on the 1st of each month | 12 months |
| Application code and migrations | Git + container registry (immutable image tags by commit SHA) | indefinitely |
| Secrets | AWS Secrets Manager (versioned) | per policy |
| Infrastructure | Terraform in Git; state in S3 with versioning | indefinitely |

Nothing else is stateful: the API is stateless, the notification outbox and idempotency records are
in the database, Stripe keeps the payment source of truth on its side.

## Backup procedure (self-managed PostgreSQL / local)

```bash
# logical backup (schema + data), compressed
pg_dump "$DATABASE_URL" --format=custom --no-owner --file=amrutam-$(date +%F).dump

# restore into an empty database
createdb amrutam_restore
pg_restore --dbname=amrutam_restore --no-owner --jobs=4 amrutam-2026-10-19.dump

# verify
psql amrutam_restore -c "select count(*) from consultations; select max(created_at) from audit_logs;"
```

For RDS, snapshots and PITR are configured in `infra/terraform/main.tf`
(`backup_retention_period = 14`, `backup_window` during low traffic in IST).

## Restore procedures

### A. Point-in-time recovery after logical corruption
1. Declare the incident; put the API in maintenance (scale ECS service to 0 or return 503 at the ALB).
2. Identify the last known-good timestamp from `audit_logs` / application logs.
3. `aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier amrutam-production --target-db-instance-identifier amrutam-pitr --restore-time <ISO>`.
4. Run read-only checks against the restored instance (row counts, latest bookings, payment totals vs Stripe dashboard).
5. Repoint `DATABASE_URL` in Secrets Manager to the restored instance; roll the ECS service.
6. Reconcile the gap: list payments that succeeded in Stripe after the restore point (`stripe events list`) and replay them through the webhook; contact affected patients for bookings made in the gap (audit logs from the old instance, if readable, give the list).
7. Post-incident: keep the old instance for 7 days for forensics.

### B. Regional failure
1. Promote the latest cross-region snapshot in the DR region (`aws rds restore-db-instance-from-db-snapshot`).
2. Apply Terraform with `aws_region = <dr region>`, `api_image` unchanged.
3. Update DNS (Route 53) to the DR load balancer; update Stripe webhook endpoint URL.
4. Expected data loss up to the snapshot copy lag (RPO ≤ 15 min for monthly copies is *not* enough:
   enable automated cross-region snapshot replication for production to reach the stated RPO).

### C. Bad deployment / migration
- Migrations are forward-only and additive where possible; destructive changes are split into
  expand → migrate data → contract across releases.
- Roll back the application image (previous SHA) first; roll back the schema only via a new forward migration.

## Drills and verification

- Quarterly: restore the latest snapshot into a staging instance, run `npm run test:e2e` against it
  (schema compatibility) and compare `select count(*)` per table with production.
- Monthly: automated restore of the latest snapshot + `SELECT 1` and row counts, reported to the on-call channel.
- After each drill: record actual RPO/RTO and update this document.

## Dependencies on third parties

- **Stripe outage:** booking still works (payment stays PENDING); consultations cannot start until paid.
  The provider abstraction allows a manual "mark as paid" tool for support if needed (not implemented).
- **Email/SMS provider outage:** jobs stay in the outbox and retry with backoff; nothing is lost.
