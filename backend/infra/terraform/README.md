# Terraform example: AWS ECS Fargate + RDS

Reference deployment for the Amrutam backend. It provisions:

- A VPC with public subnets (load balancer) and private subnets (API tasks, database).
- An RDS PostgreSQL 17 instance: encrypted at rest, 14-day automated backups, Multi-AZ in production.
- An ECS Fargate service running the Docker image behind an HTTPS Application Load Balancer.
- CPU-based autoscaling, CloudWatch logs, and a Secrets Manager secret for runtime secrets.

```bash
cd infra/terraform
terraform init
terraform plan -var api_image=<ecr-image> -var acm_certificate_arn=<arn> -var environment=staging
terraform apply ...
```

After `apply`, set the JSON keys `DATABASE_URL`, `JWT_ACCESS_SECRET`, `MFA_ENCRYPTION_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` on the secret printed as `app_secret_arn`,
then run migrations once with a one-off task:

```bash
aws ecs run-task --cluster amrutam-staging --task-definition amrutam-api \
  --overrides '{"containerOverrides":[{"name":"api","command":["npx","prisma","migrate","deploy"]}]}' ...
```

Not included (out of scope for the assignment, documented in `docs/`): WAF, Route 53, ECR
repository, CI deploy role, read replicas.
