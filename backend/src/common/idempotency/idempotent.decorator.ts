import { SetMetadata, UseInterceptors, applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { IdempotencyInterceptor } from './idempotency.interceptor';

export const IDEMPOTENT_KEY = 'idempotent';
export const IDEMPOTENCY_HEADER = 'idempotency-key';

/**
 * Requires an `Idempotency-Key` header and replays the stored response for a
 * repeated key from the same user. Apply to non-idempotent POST endpoints.
 */
export function Idempotent() {
  return applyDecorators(
    SetMetadata(IDEMPOTENT_KEY, true),
    UseInterceptors(IdempotencyInterceptor),
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description:
        'Client-generated unique key (UUID recommended). Retries with the same key return the original result.',
    }),
  );
}
