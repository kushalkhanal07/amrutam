output "alb_dns_name" {
  value = aws_lb.api.dns_name
}

output "db_endpoint" {
  value = aws_db_instance.postgres.address
}

output "app_secret_arn" {
  description = "Populate with DATABASE_URL, JWT_ACCESS_SECRET, MFA_ENCRYPTION_KEY, STRIPE_* as JSON keys"
  value       = aws_secretsmanager_secret.app.arn
}
