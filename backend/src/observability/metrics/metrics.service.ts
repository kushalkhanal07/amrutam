import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/** Prometheus registry and the application's metrics. Scraped at GET /metrics. */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  readonly httpRequestErrorsTotal = new Counter({
    name: 'http_request_errors_total',
    help: 'HTTP responses with status >= 500',
    labelNames: ['method', 'route'] as const,
    registers: [this.registry],
  });

  readonly dbUp = new Gauge({
    name: 'db_up',
    help: '1 when the database answers SELECT 1, else 0',
    registers: [this.registry],
  });

  readonly bookingsTotal = new Counter({
    name: 'bookings_total',
    help: 'Booking attempts by result',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  readonly notificationsProcessed = new Counter({
    name: 'notification_jobs_processed_total',
    help: 'Notification jobs processed by outcome',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'amrutam_' });
  }

  observeHttp(method: string, route: string, statusCode: number, seconds: number): void {
    const labels = { method, route, status_code: String(statusCode) };
    this.httpRequestDuration.observe(labels, seconds);
    this.httpRequestsTotal.inc(labels);
    if (statusCode >= 500) {
      this.httpRequestErrorsTotal.inc({ method, route });
    }
  }
}
