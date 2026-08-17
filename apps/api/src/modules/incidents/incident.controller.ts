import { performance } from "node:perf_hooks";
import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  DataClass,
  PolicyAction,
  requireAccessScope,
} from "@atgt/authorization";
import {
  CreateSosSchema,
  ERROR_CODES,
  IdempotencyKeySchema,
  OpsIncidentFeedQuerySchema,
  OpsIncidentTransitionRequestSchema,
  type CreateSosDto,
  type OpsIncident,
  type OpsIncidentFeed,
  type OpsIncidentFeedQuery,
  type OpsIncidentTransitionRequest,
  type PublicIncidentTracking,
  type SosAcceptedDto,
} from "@atgt/contracts";
import { createTraceId, requestContext } from "@atgt/observability";
import type { Response } from "express";
import { SafeHttpException } from "../../platform/safe-http.exception";
import { ZodValidationPipe } from "../../platform/zod-validation.pipe";
import {
  PublicRoute,
  RequirePolicy,
} from "../identity/authorization.decorators";
import type { AuthorizedRequest } from "../identity/authorization.guard";
import { IncidentMetrics } from "./incident.metrics";
import {
  IncidentFailure,
  PostgresIncidentRepository,
} from "./incident.repository";

function traceId(): string {
  return requestContext.current()?.traceId ?? createTraceId();
}

function rethrow(error: unknown): never {
  if (!(error instanceof IncidentFailure)) throw error;
  if (error.code === "CONFIGURATION_BLOCKED") {
    throw new SafeHttpException(
      503,
      ERROR_CODES.CONFIGURATION_BLOCKED,
      "SOS intake unavailable",
      "SOS intake is not configured for this deployment",
    );
  }
  if (error.code === "IDEMPOTENCY_CONFLICT") {
    throw new SafeHttpException(
      409,
      ERROR_CODES.IDEMPOTENCY_CONFLICT,
      "Idempotency conflict",
      "The idempotency key was already used for another request",
    );
  }
  if (error.code === "IDEMPOTENCY_IN_PROGRESS") {
    throw new SafeHttpException(
      409,
      ERROR_CODES.IDEMPOTENCY_IN_PROGRESS,
      "Request still processing",
      "The SOS request is still processing",
    );
  }
  if (error.code === "INCIDENT_TYPE_UNAVAILABLE") {
    throw new SafeHttpException(
      422,
      ERROR_CODES.INCIDENT_TYPE_UNAVAILABLE,
      "Incident type unavailable",
      "The selected incident type is unavailable",
    );
  }
  if (error.code === "FORBIDDEN") {
    throw new SafeHttpException(
      403,
      ERROR_CODES.FORBIDDEN,
      "Forbidden",
      "Incident access is outside the resolved scope",
    );
  }
  if (error.code === "NOT_FOUND") {
    throw new SafeHttpException(
      404,
      ERROR_CODES.NOT_FOUND,
      "Not found",
      "The requested case was not found",
    );
  }
  throw new SafeHttpException(
    409,
    ERROR_CODES.INVALID_STATE_TRANSITION,
    "Invalid incident transition",
    "The requested transition does not satisfy state, actor or version rules",
  );
}

@Controller("public")
export class PublicIncidentController {
  constructor(
    private readonly incidents: PostgresIncidentRepository,
    private readonly metrics: IncidentMetrics,
  ) {}

  @Post("sos")
  @PublicRoute()
  @HttpCode(HttpStatus.ACCEPTED)
  @Header("Cache-Control", "no-store")
  async accept(
    @Headers("idempotency-key") idempotencyKeyInput: string | undefined,
    @Body(new ZodValidationPipe(CreateSosSchema)) body: CreateSosDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SosAcceptedDto> {
    const started = performance.now();
    try {
      const idempotencyKey =
        IdempotencyKeySchema.safeParse(idempotencyKeyInput);
      if (!idempotencyKey.success) {
        throw new BadRequestException("Request validation failed");
      }
      const result = await this.incidents.acceptSos(
        body,
        idempotencyKey.data,
        traceId(),
      );
      const duration = performance.now() - started;
      this.metrics.recordAccepted(duration, result.replayed);
      response.setHeader("Idempotency-Replayed", String(result.replayed));
      response.setHeader(
        "Server-Timing",
        `sos-accept;dur=${duration.toFixed(1)}`,
      );
      return result.response;
    } catch (error) {
      this.metrics.recordFailure(performance.now() - started);
      rethrow(error);
    }
  }

  @Get("cases/:publicCode")
  @PublicRoute()
  @Header("Cache-Control", "no-store")
  async tracking(
    @Param("publicCode") publicCode: string,
  ): Promise<PublicIncidentTracking> {
    try {
      return await this.incidents.publicTracking(publicCode);
    } catch (error) {
      rethrow(error);
    }
  }
}

@Controller("ops/areas/:areaId/incidents")
export class OpsIncidentController {
  constructor(private readonly incidents: PostgresIncidentRepository) {}

  @Get("feed")
  @RequirePolicy({
    action: PolicyAction.INCIDENT_READ,
    dataClass: DataClass.SENSITIVE,
    areaParam: "areaId",
  })
  feed(
    @Param("areaId") areaId: string,
    @Req() request: AuthorizedRequest,
    @Query(new ZodValidationPipe(OpsIncidentFeedQuerySchema))
    query: OpsIncidentFeedQuery,
  ): Promise<OpsIncidentFeed> {
    return this.incidents.feed(
      requireAccessScope(request.accessScope),
      areaId,
      query,
    );
  }

  @Post(":incidentId/transitions")
  @HttpCode(HttpStatus.OK)
  @RequirePolicy({
    action: PolicyAction.INCIDENT_UPDATE_STATUS,
    dataClass: DataClass.SENSITIVE,
    areaParam: "areaId",
  })
  async transition(
    @Param("areaId") areaId: string,
    @Param("incidentId", ParseUUIDPipe) incidentId: string,
    @Req() request: AuthorizedRequest,
    @Body(new ZodValidationPipe(OpsIncidentTransitionRequestSchema))
    body: OpsIncidentTransitionRequest,
  ): Promise<OpsIncident> {
    try {
      return await this.incidents.transition(
        incidentId,
        areaId,
        requireAccessScope(request.accessScope),
        body,
        traceId(),
      );
    } catch (error) {
      rethrow(error);
    }
  }
}

@Controller("metrics")
export class IncidentMetricsController {
  constructor(private readonly metrics: IncidentMetrics) {}

  @Get()
  @PublicRoute()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  metricsText(): string {
    return this.metrics.renderPrometheus();
  }
}
