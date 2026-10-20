import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, mergeMap, tap } from 'rxjs/operators';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { sha256 } from '../crypto/secret-box';
import { AuthUser } from '../decorators/current-user.decorator';
import { addHours } from '../utils/dates';
import { IDEMPOTENCY_HEADER } from './idempotent.decorator';

/**
 * Idempotency protocol
 *  1. Insert (userId, key, requestHash). The unique constraint means exactly one
 *     request can own a key, even when retries arrive concurrently.
 *  2. Existing + completed + same hash  -> replay stored status/body.
 *  3. Existing + different hash         -> 422 (key reused for a different payload).
 *  4. Existing + not completed          -> 409 (original request still running).
 *  5. Handler succeeds                  -> store status + body.
 *  6. Handler fails                     -> delete record so the client may retry.
 * Records expire after IDEMPOTENCY_TTL_HOURS and are swept by the worker.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.header(IDEMPOTENCY_HEADER);

    if (!key || key.length > 128) {
      throw new BadRequestException('Idempotency-Key header is required (max 128 characters)');
    }
    if (!req.user) {
      throw new BadRequestException('Idempotent routes require an authenticated user');
    }
    const userId = req.user.id;
    const requestHash = sha256(`${req.method}:${req.path}:${JSON.stringify(req.body ?? {})}`);

    return from(this.claim(userId, key, requestHash)).pipe(
      mergeMap((claim) => {
        if (claim.replay) {
          res.status(claim.statusCode);
          res.setHeader('Idempotent-Replayed', 'true');
          return of(claim.body);
        }
        return next.handle().pipe(
          tap((body) => void this.complete(userId, key, res.statusCode, body)),
          catchError((err: unknown) =>
            from(this.release(userId, key)).pipe(mergeMap(() => throwError(() => err))),
          ),
        );
      }),
    );
  }

  private async claim(
    userId: string,
    key: string,
    requestHash: string,
  ): Promise<{ replay: false } | { replay: true; statusCode: number; body: unknown }> {
    const ttlHours = this.config.get('IDEMPOTENCY_TTL_HOURS');
    try {
      await this.prisma.idempotencyRecord.create({
        data: { userId, key, requestHash, expiresAt: addHours(new Date(), ttlHours) },
      });
      return { replay: false };
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        throw err;
      }
    }

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (!existing) {
      // Lost a race with a delete; let the handler run.
      return this.claim(userId, key, requestHash);
    }
    if (existing.expiresAt < new Date()) {
      await this.prisma.idempotencyRecord.delete({ where: { id: existing.id } }).catch(() => undefined);
      return this.claim(userId, key, requestHash);
    }
    if (existing.requestHash !== requestHash) {
      throw new UnprocessableEntityException(
        'Idempotency-Key was already used with a different request payload',
      );
    }
    if (!existing.completedAt) {
      throw new ConflictException('A request with this Idempotency-Key is already in progress');
    }
    return { replay: true, statusCode: existing.statusCode ?? 200, body: existing.responseBody };
  }

  private async complete(userId: string, key: string, statusCode: number, body: unknown): Promise<void> {
    try {
      await this.prisma.idempotencyRecord.update({
        where: { userId_key: { userId, key } },
        data: {
          statusCode,
          responseBody: (body ?? null) as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn({ err }, 'Failed to persist idempotency response');
    }
  }

  private async release(userId: string, key: string): Promise<void> {
    await this.prisma.idempotencyRecord.deleteMany({ where: { userId, key, completedAt: null } });
  }
}
