import { Injectable, NestMiddleware } from "@nestjs/common";
import {
  createRequestId,
  createTraceId,
  requestContext,
} from "@atgt/observability";
import type { NextFunction, Request, Response } from "express";

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const suppliedRequestId = request.header("x-request-id");
    const requestId =
      suppliedRequestId && REQUEST_ID_PATTERN.test(suppliedRequestId)
        ? suppliedRequestId.toLowerCase()
        : createRequestId();

    const traceParent = request.header("traceparent");
    const traceId =
      traceParent?.match(TRACEPARENT_PATTERN)?.[1]?.toLowerCase() ??
      createTraceId();

    response.setHeader("x-request-id", requestId);
    response.setHeader("x-trace-id", traceId);
    requestContext.run({ requestId, traceId }, next);
  }
}
