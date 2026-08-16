import { BadRequestException, type ArgumentsHost } from "@nestjs/common";
import { CreateSosSchema, ERROR_CODES } from "@atgt/contracts";
import { requestContext } from "@atgt/observability";
import type { NextFunction, Request, Response } from "express";
import { ProblemDetailsFilter } from "./problem-details.filter";
import { RequestContextMiddleware } from "./request-context.middleware";
import { ZodValidationPipe } from "./zod-validation.pipe";

describe("request/error platform", () => {
  it("propagates a valid W3C trace ID and generates a safe request ID", () => {
    const middleware = new RequestContextMiddleware();
    const headers: Record<string, string> = {
      traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
      "x-request-id": "not-a-safe-id",
    };
    const responseHeaders: Record<string, string> = {};
    const request = {
      header: (name: string) => headers[name.toLowerCase()],
    } as Request;
    const response = {
      setHeader: (name: string, value: string) => {
        responseHeaders[name.toLowerCase()] = value;
      },
    } as unknown as Response;
    const next = jest.fn(() => {
      expect(requestContext.current()?.traceId).toBe(
        "0123456789abcdef0123456789abcdef",
      );
    }) as NextFunction;

    middleware.use(request, response, next);

    expect(responseHeaders["x-trace-id"]).toBe(
      "0123456789abcdef0123456789abcdef",
    );
    expect(responseHeaders["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns RFC Problem Details without stack traces or exception secrets", () => {
    const filter = new ProblemDetailsFilter();
    let status = 0;
    let contentType = "";
    let body: unknown;
    const response = {
      status: (value: number) => {
        status = value;
        return response;
      },
      type: (value: string) => {
        contentType = value;
        return response;
      },
      json: (value: unknown) => {
        body = value;
        return response;
      },
    } as unknown as Response;
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ path: "/api/v1/private" }) as Request,
        getResponse: () => response,
      }),
    } as ArgumentsHost;

    requestContext.run(
      {
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        traceId: "a".repeat(32),
      },
      () => filter.catch(new Error("password=do-not-leak"), host),
    );

    expect(status).toBe(500);
    expect(contentType).toBe("application/problem+json");
    expect(body).toMatchObject({
      error_code: ERROR_CODES.INTERNAL_ERROR,
      trace_id: "a".repeat(32),
    });
    expect(JSON.stringify(body)).not.toContain("password");
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("turns schema errors into a safe bad request exception", () => {
    const pipe = new ZodValidationPipe(CreateSosSchema);
    expect(() => pipe.transform({ coordinateLongitude: 999 })).toThrow(
      BadRequestException,
    );
  });
});
