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
  })
  .strict();
export type CitizenReportAccepted = z.infer<typeof CitizenReportAcceptedSchema>;

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
