import { z } from "zod";

/** Stable error codes. Values are append-only after release. */
export const ERROR_CODES = {
  VALIDATION_FAILED: "ATGT_VALIDATION_FAILED",
  COORDINATE_INVALID: "ATGT_COORDINATE_INVALID",
  UNAUTHORIZED: "ATGT_UNAUTHORIZED",
  FORBIDDEN: "ATGT_FORBIDDEN",
  NOT_FOUND: "ATGT_NOT_FOUND",
  CONFLICT: "ATGT_CONFLICT",
  IDEMPOTENCY_CONFLICT: "ATGT_IDEMPOTENCY_CONFLICT",
  IDEMPOTENCY_IN_PROGRESS: "ATGT_IDEMPOTENCY_IN_PROGRESS",
  INVALID_STATE_TRANSITION: "ATGT_INVALID_STATE_TRANSITION",
  INSUFFICIENT_PERMISSION_FOR_TRANSITION:
    "ATGT_INSUFFICIENT_PERMISSION_FOR_TRANSITION",
  EVIDENCE_MIME_NOT_ALLOWED: "ATGT_EVIDENCE_MIME_NOT_ALLOWED",
  EVIDENCE_SIZE_EXCEEDED: "ATGT_EVIDENCE_SIZE_EXCEEDED",
  EVIDENCE_HASH_MISMATCH: "ATGT_EVIDENCE_HASH_MISMATCH",
  RATE_LIMIT_EXCEEDED: "ATGT_RATE_LIMIT_EXCEEDED",
  MAP_PROVIDER_UNAVAILABLE: "ATGT_MAP_PROVIDER_UNAVAILABLE",
  INTERNAL_ERROR: "ATGT_INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const errorCodeValues = Object.values(ERROR_CODES) as [
  ErrorCode,
  ...ErrorCode[],
];

/** RFC 9457 response plus stable ATGT correlation extensions. */
export const ProblemDetailsSchema = z
  .object({
    type: z.string().min(1),
    title: z.string().min(1).max(200),
    status: z.number().int().min(400).max(599),
    detail: z.string().min(1).max(1000),
    instance: z.string().min(1).optional(),
    error_code: z.enum(errorCodeValues),
    trace_id: z.string().regex(/^[0-9a-f]{32}$/),
  })
  .strict();

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;
