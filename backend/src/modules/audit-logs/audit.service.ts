import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { DbClient, PrismaService } from '../../prisma/prisma.service';

/** Canonical audit action names. Keep them stable: dashboards and compliance queries depend on them. */
export const AuditAction = {
  AUTH_REGISTER: 'auth.register',
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAILURE: 'auth.login.failure',
  AUTH_MFA_FAILURE: 'auth.mfa.failure',
  AUTH_MFA_ENABLED: 'auth.mfa.enabled',
  AUTH_MFA_DISABLED: 'auth.mfa.disabled',
  AUTH_REFRESH_REUSE: 'auth.refresh.reuse_detected',
  AUTH_LOGOUT: 'auth.logout',
  USER_ROLE_CHANGED: 'user.role.changed',
  USER_STATUS_CHANGED: 'user.status.changed',
  DOCTOR_VERIFIED: 'doctor.verification.changed',
  BOOKING_CREATED: 'booking.created',
  BOOKING_CANCELLED: 'booking.cancelled',
  CONSULTATION_STATUS_CHANGED: 'consultation.status.changed',
  PRESCRIPTION_CREATED: 'prescription.created',
  PAYMENT_INTENT_CREATED: 'payment.intent.created',
  PAYMENT_STATUS_CHANGED: 'payment.status.changed',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEvent {
  action: AuditActionType;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  actorRole?: Role | null;
  /** Non-sensitive context only: ids, statuses, counts. Never clinical text or secrets. */
  metadata?: Record<string, unknown>;
  context?: RequestContext;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes an audit row using the given client. Pass the transaction client
   * when the event must commit atomically with the business change.
   */
  async record(event: AuditEvent, db: DbClient = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId ?? null,
        actorId: event.actorId ?? null,
        actorRole: event.actorRole ?? null,
        metadata: (event.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: event.context?.ip ?? null,
        userAgent: event.context?.userAgent ?? null,
        requestId: event.context?.requestId ?? null,
      },
    });
  }

  /** Best-effort variant for paths where audit failure must not break the request (e.g. login failures). */
  async recordSafe(event: AuditEvent): Promise<void> {
    try {
      await this.record(event);
    } catch (err) {
      this.logger.error({ err, action: event.action }, 'Failed to write audit event');
    }
  }
}
