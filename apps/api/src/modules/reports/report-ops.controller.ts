import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  DataClass,
  PolicyAction,
  requireAccessScope,
} from "@atgt/authorization";
import {
  DuplicateFalsePositiveRequestSchema,
  ERROR_CODES,
  OpsReportVerificationDecisionSchema,
  OpsReportVerificationQueueQuerySchema,
  type DuplicateFalsePositiveRequest,
  type OpsReport,
  type OpsReportDuplicateCandidate,
  type OpsReportVerificationDecision,
  type OpsReportVerificationQueue,
  type OpsReportVerificationQueueQuery,
} from "@atgt/contracts";
import { createTraceId, requestContext } from "@atgt/observability";
import { SafeHttpException } from "../../platform/safe-http.exception";
import { ZodValidationPipe } from "../../platform/zod-validation.pipe";
import { RequirePolicy } from "../identity/authorization.decorators";
import type { AuthorizedRequest } from "../identity/authorization.guard";
import {
  PostgresReportOpsRepository,
  ReportOpsFailure,
} from "./report-ops.repository";

function traceId(): string {
  return requestContext.current()?.traceId ?? createTraceId();
}

function rethrow(error: unknown): never {
  if (!(error instanceof ReportOpsFailure)) throw error;
  if (error.code === "FORBIDDEN") {
    throw new SafeHttpException(
      403,
      ERROR_CODES.FORBIDDEN,
      "Forbidden",
      "Report access is outside the resolved scope",
    );
  }
  if (error.code === "NOT_FOUND") {
    throw new SafeHttpException(
      404,
      ERROR_CODES.NOT_FOUND,
      "Not found",
      "The requested report was not found",
    );
  }
  throw new SafeHttpException(
    409,
    ERROR_CODES.INVALID_STATE_TRANSITION,
    "Report verification conflict",
    "The report or duplicate suggestion no longer satisfies the requested transition",
  );
}

@Controller("ops/areas/:areaId/reports")
export class OpsReportController {
  constructor(private readonly reports: PostgresReportOpsRepository) {}

  @Get("verification")
  @RequirePolicy({
    action: PolicyAction.REPORT_READ,
    dataClass: DataClass.SENSITIVE,
    areaParam: "areaId",
  })
  verificationQueue(
    @Param("areaId") areaId: string,
    @Req() request: AuthorizedRequest,
    @Query(new ZodValidationPipe(OpsReportVerificationQueueQuerySchema))
    query: OpsReportVerificationQueueQuery,
  ): Promise<OpsReportVerificationQueue> {
    return this.reports.verificationQueue(
      requireAccessScope(request.accessScope),
      areaId,
      query,
    );
  }

  @Post(":reportId/verification")
  @HttpCode(HttpStatus.OK)
  @RequirePolicy({
    action: PolicyAction.REPORT_VERIFY,
    dataClass: DataClass.SENSITIVE,
    areaParam: "areaId",
  })
  async decide(
    @Param("areaId") areaId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @Req() request: AuthorizedRequest,
    @Body(new ZodValidationPipe(OpsReportVerificationDecisionSchema))
    body: OpsReportVerificationDecision,
  ): Promise<OpsReport> {
    try {
      return await this.reports.decide(
        requireAccessScope(request.accessScope),
        areaId,
        reportId,
        body,
        traceId(),
      );
    } catch (error) {
      rethrow(error);
    }
  }

  @Post(":reportId/duplicate-candidates/:candidateId/false-positive")
  @HttpCode(HttpStatus.OK)
  @RequirePolicy({
    action: PolicyAction.REPORT_VERIFY,
    dataClass: DataClass.SENSITIVE,
    areaParam: "areaId",
  })
  async falsePositive(
    @Param("areaId") areaId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @Param("candidateId", ParseUUIDPipe) candidateId: string,
    @Req() request: AuthorizedRequest,
    @Body(new ZodValidationPipe(DuplicateFalsePositiveRequestSchema))
    body: DuplicateFalsePositiveRequest,
  ): Promise<OpsReportDuplicateCandidate> {
    try {
      return await this.reports.markDuplicateFalsePositive(
        requireAccessScope(request.accessScope),
        areaId,
        reportId,
        candidateId,
        body,
        traceId(),
      );
    } catch (error) {
      rethrow(error);
    }
  }
}
