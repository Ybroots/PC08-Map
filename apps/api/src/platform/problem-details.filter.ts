import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import {
  ERROR_CODES,
  type ErrorCode,
  ProblemDetailsSchema,
} from "@atgt/contracts";
import { createTraceId, requestContext } from "@atgt/observability";
import type { Request, Response } from "express";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "./idempotency";
import { SafeHttpException } from "./safe-http.exception";

interface ErrorDescriptor {
  title: string;
  detail: string;
  errorCode: ErrorCode;
}

function describe(status: number, exception: unknown): ErrorDescriptor {
  if (exception instanceof SafeHttpException) {
    return {
      title: exception.publicTitle,
      detail: exception.publicDetail,
      errorCode: exception.errorCode,
    };
  }
  if (exception instanceof IdempotencyConflictError) {
    return {
      title: "Idempotency conflict",
      detail: "The idempotency key was already used for a different request",
      errorCode: ERROR_CODES.IDEMPOTENCY_CONFLICT,
    };
  }
  if (exception instanceof IdempotencyInProgressError) {
    return {
      title: "Request is still processing",
      detail: "A request with this idempotency key is still processing",
      errorCode: ERROR_CODES.IDEMPOTENCY_IN_PROGRESS,
    };
  }
  if (status === HttpStatus.BAD_REQUEST) {
    return {
      title: "Validation failed",
      detail: "Request validation failed",
      errorCode: ERROR_CODES.VALIDATION_FAILED,
    };
  }
  if (status === HttpStatus.UNAUTHORIZED) {
    return {
      title: "Unauthorized",
      detail: "Authentication is required",
      errorCode: ERROR_CODES.UNAUTHORIZED,
    };
  }
  if (status === HttpStatus.FORBIDDEN) {
    return {
      title: "Forbidden",
      detail: "Access is denied",
      errorCode: ERROR_CODES.FORBIDDEN,
    };
  }
  if (status === HttpStatus.NOT_FOUND) {
    return {
      title: "Not found",
      detail: "The requested resource was not found",
      errorCode: ERROR_CODES.NOT_FOUND,
    };
  }
  if (status === HttpStatus.CONFLICT) {
    return {
      title: "Conflict",
      detail: "The request conflicts with the current resource state",
      errorCode: ERROR_CODES.CONFLICT,
    };
  }
  return {
    title: "Internal server error",
    detail: "The request could not be completed",
    errorCode: ERROR_CODES.INTERNAL_ERROR,
  };
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof IdempotencyConflictError ||
      exception instanceof IdempotencyInProgressError
        ? HttpStatus.CONFLICT
        : exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
    const descriptor = describe(status, exception);
    const traceId = requestContext.current()?.traceId ?? createTraceId();
    const problem = ProblemDetailsSchema.parse({
      type: `https://atgt.local/problems/${descriptor.errorCode.toLowerCase().replaceAll("_", "-")}`,
      title: descriptor.title,
      status,
      detail: descriptor.detail,
      instance: request.path,
      error_code: descriptor.errorCode,
      trace_id: traceId,
    });

    response.status(status).type("application/problem+json").json(problem);
  }
}
