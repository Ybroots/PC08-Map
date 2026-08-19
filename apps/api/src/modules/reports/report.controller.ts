import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import {
  CreateCitizenReportSchema,
  ERROR_CODES,
  IdempotencyKeySchema,
  ReportEvidenceLinkHeadersSchema,
  ReportEvidenceLinkParamsSchema,
  type CitizenReportAccepted,
  type CreateCitizenReport,
  type PublicReportTracking,
  type ReportEvidenceLinked,
} from "@atgt/contracts";
import { createTraceId, requestContext } from "@atgt/observability";
import type { Response } from "express";
import { SafeHttpException } from "../../platform/safe-http.exception";
import { ZodValidationPipe } from "../../platform/zod-validation.pipe";
import {
  PublicRoute,
  RequireCitizenSession,
} from "../identity/authorization.decorators";
import { PostgresReportRepository, ReportFailure } from "./report.repository";

function traceId(): string {
  return requestContext.current()?.traceId ?? createTraceId();
}

function rethrow(error: unknown): never {
  if (!(error instanceof ReportFailure)) throw error;
  if (error.code === "CONFIGURATION_BLOCKED") {
    throw new SafeHttpException(
      503,
      ERROR_CODES.CONFIGURATION_BLOCKED,
      "Citizen report intake unavailable",
      "Citizen report intake is not configured for this deployment",
    );
  }
  if (error.code === "CATEGORY_UNAVAILABLE") {
    throw new SafeHttpException(
      422,
      ERROR_CODES.REPORT_CATEGORY_UNAVAILABLE,
      "Report category unavailable",
      "The selected citizen report category is unavailable",
    );
  }
  if (error.code === "EVIDENCE_UNAVAILABLE") {
    throw new SafeHttpException(
      404,
      ERROR_CODES.REPORT_EVIDENCE_UNAVAILABLE,
      "Evidence unavailable",
      "The requested evidence is not available for this report",
    );
  }
  if (error.code === "IDEMPOTENCY_CONFLICT") {
    throw new SafeHttpException(
      409,
      ERROR_CODES.IDEMPOTENCY_CONFLICT,
      "Idempotency conflict",
      "The idempotency key was already used for another citizen report",
    );
  }
  if (error.code === "IDEMPOTENCY_IN_PROGRESS") {
    throw new SafeHttpException(
      409,
      ERROR_CODES.IDEMPOTENCY_IN_PROGRESS,
      "Request still processing",
      "The citizen report request is still processing",
    );
  }
  throw new SafeHttpException(
    404,
    ERROR_CODES.NOT_FOUND,
    "Not found",
    "The requested citizen report was not found",
  );
}

@Controller("public/reports")
export class PublicReportController {
  constructor(private readonly reports: PostgresReportRepository) {}

  @Post()
  @PublicRoute()
  @RequireCitizenSession()
  @HttpCode(HttpStatus.ACCEPTED)
  @Header("Cache-Control", "no-store")
  async accept(
    @Headers("idempotency-key") idempotencyKeyInput: string | undefined,
    @Body(new ZodValidationPipe(CreateCitizenReportSchema))
    body: CreateCitizenReport,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CitizenReportAccepted> {
    const idempotencyKey = IdempotencyKeySchema.safeParse(idempotencyKeyInput);
    if (!idempotencyKey.success) {
      throw new BadRequestException("Request validation failed");
    }
    try {
      const result = await this.reports.accept(
        body,
        idempotencyKey.data,
        traceId(),
      );
      response.setHeader("Idempotency-Replayed", String(result.replayed));
      return result.response;
    } catch (error) {
      rethrow(error);
    }
  }

  @Get(":publicCode")
  @PublicRoute()
  @Header("Cache-Control", "no-store")
  async tracking(
    @Param("publicCode") publicCode: string,
  ): Promise<PublicReportTracking> {
    try {
      return await this.reports.publicTracking(publicCode);
    } catch (error) {
      rethrow(error);
    }
  }

  @Post(":publicCode/evidence/:evidenceId")
  @PublicRoute()
  @RequireCitizenSession()
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async attachEvidence(
    @Param() paramsInput: Record<string, string>,
    @Headers("x-report-capability") reportCapabilityInput: string | undefined,
    @Headers("x-upload-capability") uploadCapabilityInput: string | undefined,
    @Headers("x-citizen-session") citizenSessionInput: string | undefined,
  ): Promise<ReportEvidenceLinked> {
    const params = ReportEvidenceLinkParamsSchema.safeParse(paramsInput);
    const headers = ReportEvidenceLinkHeadersSchema.safeParse({
      "x-report-capability": reportCapabilityInput,
      "x-upload-capability": uploadCapabilityInput,
      "x-citizen-session": citizenSessionInput,
    });
    if (!params.success || !headers.success) {
      throw new BadRequestException("Request validation failed");
    }
    try {
      return await this.reports.attachEvidence(
        params.data.publicCode,
        params.data.evidenceId,
        headers.data["x-report-capability"],
        headers.data["x-upload-capability"],
        traceId(),
      );
    } catch (error) {
      rethrow(error);
    }
  }
}
