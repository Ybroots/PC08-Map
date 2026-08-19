import { z } from "zod";
import { IdempotencyKeySchema } from "../common/idempotency";

export const ReportStateSchema = z.enum([
  "RECEIVED",
  "SCREENING",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "REJECTED",
  "DUPLICATE",
  "IN_PROCESS",
  "RESOLVED",
  "CLOSED",
  "ARCHIVED",
]);
export type ReportStateValue = z.infer<typeof ReportStateSchema>;

export const ReportIdempotencyHeadersSchema = z
  .object({ "idempotency-key": IdempotencyKeySchema })
  .strict();

export const CreateCitizenReportSchema = z
  .object({
    categoryCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
    coordinateLongitude: z.number().finite().min(-180).max(180),
    coordinateLatitude: z.number().finite().min(-90).max(90),
    description: z.string().trim().min(1).max(1000),
    plateTextUnverified: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .refine(
        (value) =>
          [...value].every((character) => {
            const code = character.codePointAt(0)!;
            return code > 31 && code !== 127;
          }),
        { message: "Plate text contains a control character" },
      )
      .optional(),
    clientReportedAt: z.string().datetime(),
  })
  .strict();
export type CreateCitizenReport = z.infer<typeof CreateCitizenReportSchema>;

export const PublicReportStatusSchema = z.enum([
  "RECEIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "INSUFFICIENT_BASIS",
]);
export type PublicReportStatus = z.infer<typeof PublicReportStatusSchema>;

export const CitizenReportAcceptedSchema = z
  .object({
    publicCode: z.string().regex(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/),
    status: z.literal("RECEIVED"),
    receivedAt: z.string().datetime(),
    reportCapability: z.string().min(43).max(256).optional(),
  })
  .strict();
export type CitizenReportAccepted = z.infer<typeof CitizenReportAcceptedSchema>;

export const ReportEvidenceLinkHeadersSchema = z
  .object({
    "x-report-capability": z.string().min(43).max(256),
    "x-upload-capability": z.string().min(43).max(256),
    "x-citizen-session": z.string().min(43).max(256),
  })
  .strict();

export const ReportEvidenceLinkParamsSchema = z
  .object({
    publicCode: z.string().regex(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/),
    evidenceId: z.string().uuid(),
  })
  .strict();

export const ReportEvidenceLinkedSchema = z
  .object({
    evidenceId: z.string().uuid(),
    state: z.literal("ATTACHED"),
  })
  .strict();
export type ReportEvidenceLinked = z.infer<typeof ReportEvidenceLinkedSchema>;

export const PublicReportTrackingSchema = z
  .object({
    publicCode: z.string().regex(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/),
    status: PublicReportStatusSchema,
    receivedAt: z.string().datetime(),
    lastUpdatedAt: z.string().datetime(),
  })
  .strict();
export type PublicReportTracking = z.infer<typeof PublicReportTrackingSchema>;

export const ReportReceivedEventDataSchema = z
  .object({
    report_id: z.string().uuid(),
    category_code: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
    area_id: z.string().min(1).max(100),
    state: z.literal("RECEIVED"),
  })
  .strict();
export type ReportReceivedEventData = z.infer<
  typeof ReportReceivedEventDataSchema
>;

export const ReportEvidenceLinkedEventDataSchema = z
  .object({
    report_id: z.string().uuid(),
    evidence_id: z.string().uuid(),
    area_id: z.string().min(1).max(100),
  })
  .strict();
export type ReportEvidenceLinkedEventData = z.infer<
  typeof ReportEvidenceLinkedEventDataSchema
>;

export const DuplicateSignalSchema = z.enum(["TIME", "SPACE", "HASH", "PLATE"]);
export type DuplicateSignal = z.infer<typeof DuplicateSignalSchema>;

export const DuplicateCandidateStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "FALSE_POSITIVE",
]);

export const OpsReportDuplicateCandidateSchema = z
  .object({
    id: z.string().uuid(),
    candidateReportId: z.string().uuid(),
    signals: z.array(DuplicateSignalSchema).min(1).max(4),
    status: DuplicateCandidateStatusSchema,
    observedAt: z.string().datetime(),
    version: z.number().int().positive(),
  })
  .strict();
export type OpsReportDuplicateCandidate = z.infer<
  typeof OpsReportDuplicateCandidateSchema
>;

export const OpsReportSchema = z
  .object({
    id: z.string().uuid(),
    categoryCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
    coordinateLongitude: z.number().finite().min(-180).max(180),
    coordinateLatitude: z.number().finite().min(-90).max(90),
    description: z.string().min(1).max(1000),
    plateTextUnverified: z.string().min(1).max(32).optional(),
    reportedAt: z.string().datetime(),
    state: ReportStateSchema,
    areaId: z.string().min(1).max(100),
    version: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    duplicateCandidates: z.array(OpsReportDuplicateCandidateSchema),
  })
  .strict();
export type OpsReport = z.infer<typeof OpsReportSchema>;

export const OpsReportVerificationQueueQuerySchema = z
  .object({
    after: z.coerce.string().regex(/^\d+$/).default("0"),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type OpsReportVerificationQueueQuery = z.infer<
  typeof OpsReportVerificationQueueQuerySchema
>;

export const OpsReportVerificationQueueItemSchema = z
  .object({ cursor: z.string().regex(/^\d+$/), report: OpsReportSchema })
  .strict();

export const OpsReportVerificationQueueSchema = z
  .object({
    items: z.array(OpsReportVerificationQueueItemSchema),
    nextCursor: z.string().regex(/^\d+$/),
    hasMore: z.boolean(),
  })
  .strict();
export type OpsReportVerificationQueue = z.infer<
  typeof OpsReportVerificationQueueSchema
>;

export const OpsReportVerificationDecisionSchema = z
  .object({
    decision: z.enum(["VERIFIED", "REJECTED", "DUPLICATE"]),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1000).optional(),
    duplicateCandidateId: z.string().uuid().optional(),
    duplicateCandidateExpectedVersion: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision !== "VERIFIED" && !value.reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "A reason is required for rejected or duplicate decisions",
      });
    }
    const hasCandidate = value.duplicateCandidateId !== undefined;
    const hasCandidateVersion =
      value.duplicateCandidateExpectedVersion !== undefined;
    if (
      value.decision === "DUPLICATE" &&
      (!hasCandidate || !hasCandidateVersion)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["duplicateCandidateId"],
        message: "A pending duplicate candidate and version are required",
      });
    }
    if (
      value.decision !== "DUPLICATE" &&
      (hasCandidate || hasCandidateVersion)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["duplicateCandidateId"],
        message:
          "Duplicate candidate fields are only valid for duplicate decisions",
      });
    }
  });
export type OpsReportVerificationDecision = z.infer<
  typeof OpsReportVerificationDecisionSchema
>;

export const DuplicateFalsePositiveRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export type DuplicateFalsePositiveRequest = z.infer<
  typeof DuplicateFalsePositiveRequestSchema
>;

export const ReportVerificationDecidedEventDataSchema = z
  .object({
    report_id: z.string().uuid(),
    area_id: z.string().min(1).max(100),
    state: z.enum(["VERIFIED", "REJECTED", "DUPLICATE"]),
    version: z.number().int().positive(),
  })
  .strict();
export type ReportVerificationDecidedEventData = z.infer<
  typeof ReportVerificationDecidedEventDataSchema
>;

export const ReportDuplicateFalsePositiveEventDataSchema = z
  .object({
    report_id: z.string().uuid(),
    candidate_id: z.string().uuid(),
    area_id: z.string().min(1).max(100),
    candidate_version: z.number().int().positive(),
  })
  .strict();
export type ReportDuplicateFalsePositiveEventData = z.infer<
  typeof ReportDuplicateFalsePositiveEventDataSchema
>;
