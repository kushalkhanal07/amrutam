import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/** Request metadata recorded on audit events. */
export interface RequestContext {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export function extractRequestContext(req: Request): RequestContext {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: (req as Request & { id?: string }).id ?? (req.headers['x-request-id'] as string | undefined),
  };
}

export const ReqContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestContext => {
  return extractRequestContext(ctx.switchToHttp().getRequest<Request>());
});
