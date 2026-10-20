import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
  path: string;
  timestamp: string;
}

/**
 * Converts every error into one stable JSON shape. Internal details (stack
 * traces, SQL, Prisma messages) are logged but never returned to clients.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() === 'ws') {
      // Socket.IO handlers: report the error to the client instead of writing an HTTP response.
      const client = host.switchToWs().getClient<{ emit: (event: string, payload: unknown) => void }>();
      const message = exception instanceof HttpException ? exception.message : 'Something went wrong';
      if (!(exception instanceof HttpException)) {
        this.logger.error(
          { err: exception instanceof Error ? exception.stack : exception },
          'Unhandled WebSocket exception',
        );
      }
      client.emit('exception', { status: 'error', message });
      return;
    }
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = exception.name;
      } else {
        const b = body as { message?: string | string[]; error?: string };
        message = b.message ?? exception.message;
        error = b.error ?? exception.name;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Map the most common constraint failures to safe HTTP responses.
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        error = 'Conflict';
        message = 'A record with the same unique value already exists';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        error = 'Not Found';
        message = 'Record not found';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        error = 'Bad Request';
        message = 'Related record does not exist';
      }
    }

    if (status >= 500) {
      this.logger.error(
        {
          requestId: request.id,
          path: request.url,
          err: exception instanceof Error ? exception.stack : exception,
        },
        'Unhandled exception',
      );
    }

    const payload: ErrorResponse = {
      statusCode: status,
      error,
      message,
      requestId: request.id,
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(status).json(payload);
  }
}
