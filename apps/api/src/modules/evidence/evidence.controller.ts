import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import {
  ERROR_CODES,
  FinalizeEvidenceUploadSchema,
  IdempotencyKeySchema,
  InitiateEvidenceUploadSchema,
  type EvidenceScanPending,
  type EvidenceUploadInitiated,
  type FinalizeEvidenceUpload,
  type InitiateEvidenceUpload,
} from "@atgt/contracts";
import { createTraceId, requestContext } from "@atgt/observability";
import { SafeHttpException } from "../../platform/safe-http.exception";
import { ZodValidationPipe } from "../../platform/zod-validation.pipe";
import {
  PublicRoute,
  RequireCitizenSession,
} from "../identity/authorization.decorators";
import { EvidenceService } from "./evidence.service";
import { EvidenceFailure } from "./evidence.types";

function traceId(): string {
  return requestContext.current()?.traceId ?? createTraceId();
}

function rethrow(error: unknown): never {
  if (!(error instanceof EvidenceFailure)) throw error;
  if (error.code === "CONFIGURATION_BLOCKED") {
    throw new SafeHttpException(
      503,
      ERROR_CODES.CONFIGURATION_BLOCKED,
      "Evidence pipeline unavailable",
      "Evidence upload is not configured for this deployment",
    );
  }
  if (error.code === "MIME_NOT_ALLOWED") {
    throw new SafeHttpException(
      422,
      ERROR_CODES.EVIDENCE_MIME_NOT_ALLOWED,
      "Evidence MIME not allowed",
      "The evidence media type is not allowed",
    );
  }
  if (error.code === "SIZE_EXCEEDED") {
    throw new SafeHttpException(
      413,
      ERROR_CODES.EVIDENCE_SIZE_EXCEEDED,
      "Evidence size rejected",
      "The evidence size does not match the allowed upload declaration",
    );
  }
  if (error.code === "HASH_MISMATCH") {
    throw new SafeHttpException(
      409,
      ERROR_CODES.EVIDENCE_HASH_MISMATCH,
      "Evidence hash mismatch",
      "The finalized checksum does not match the upload declaration",
    );
  }
  if (error.code === "NOT_FOUND") {
    throw new SafeHttpException(
      404,
      ERROR_CODES.NOT_FOUND,
      "Evidence upload not found",
      "The evidence upload was not found",
    );
  }
  if (error.code === "IDEMPOTENCY_CONFLICT") {
    throw new SafeHttpException(
      409,
      ERROR_CODES.IDEMPOTENCY_CONFLICT,
      "Idempotency conflict",
      "The idempotency key was already used for another upload declaration",
    );
  }
  if (error.code === "IDEMPOTENCY_IN_PROGRESS") {
    throw new SafeHttpException(
      409,
      ERROR_CODES.IDEMPOTENCY_IN_PROGRESS,
      "Request still processing",
      "The evidence initiation request is still processing",
    );
  }
  if (error.code === "STORAGE_UNAVAILABLE") {
    throw new SafeHttpException(
      503,
      ERROR_CODES.EVIDENCE_STORAGE_UNAVAILABLE,
      "Evidence storage unavailable",
      "The evidence storage provider is unavailable",
    );
  }
  throw new SafeHttpException(
    409,
    ERROR_CODES.CONFLICT,
    "Evidence upload conflict",
    error.code === "UPLOAD_MISSING"
      ? "The quarantine upload is missing"
      : error.code === "EXPIRED"
        ? "The evidence upload authorization expired"
        : "The evidence upload cannot be finalized in its current state",
  );
}

@Controller("public/uploads")
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Post("initiate")
  @PublicRoute()
  @RequireCitizenSession()
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "no-store")
  async initiate(
    @Headers("idempotency-key") idempotencyKeyInput: string | undefined,
    @Body(new ZodValidationPipe(InitiateEvidenceUploadSchema))
    body: InitiateEvidenceUpload,
  ): Promise<EvidenceUploadInitiated> {
    const idempotencyKey = IdempotencyKeySchema.safeParse(idempotencyKeyInput);
    if (!idempotencyKey.success) {
      throw new BadRequestException("Request validation failed");
    }
    try {
      return await this.evidence.initiate(body, idempotencyKey.data, traceId());
    } catch (error) {
      rethrow(error);
    }
  }

  @Post(":uploadId/finalize")
  @PublicRoute()
  @RequireCitizenSession()
  @HttpCode(HttpStatus.ACCEPTED)
  @Header("Cache-Control", "no-store")
  async finalize(
    @Param("uploadId", ParseUUIDPipe) uploadId: string,
    @Headers("x-upload-capability") capability: string | undefined,
    @Body(new ZodValidationPipe(FinalizeEvidenceUploadSchema))
    body: FinalizeEvidenceUpload,
  ): Promise<EvidenceScanPending> {
    if (!capability || capability.length < 43 || capability.length > 256) {
      throw new BadRequestException("Request validation failed");
    }
    try {
      return await this.evidence.finalize(
        uploadId,
        capability,
        body,
        traceId(),
      );
    } catch (error) {
      rethrow(error);
    }
  }
}
