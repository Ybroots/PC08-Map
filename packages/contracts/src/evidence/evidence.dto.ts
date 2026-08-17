import { z } from "zod";
import {
  EVENT_ROUTING_KEYS,
  eventEnvelopeSchema,
} from "../events/event-envelope";
import { IdempotencyKeySchema } from "../common/idempotency";

export const EvidenceSha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const EvidenceMimeSchema = z
  .string()
  .min(3)
  .max(127)
  .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/);

export const EvidenceUploadStateSchema = z.enum([
  "INITIATED",
  "SCAN_PENDING",
  "READY",
  "REJECTED",
]);

export const InitiateEvidenceUploadSchema = z
  .object({
    declared_mime: EvidenceMimeSchema,
    declared_size_bytes: z.number().int().positive().safe(),
    declared_sha256: EvidenceSha256Schema,
  })
  .strict();

export const EvidenceUploadInitiatedSchema = z
  .object({
    upload_id: z.string().uuid(),
    upload_url: z.string().url(),
    upload_method: z.literal("PUT"),
    upload_capability: z.string().min(43).max(256),
    expires_at: z.string().datetime(),
  })
  .strict();

export const FinalizeEvidenceUploadSchema = z
  .object({
    observed_sha256: EvidenceSha256Schema,
  })
  .strict();

export const EvidenceUploadCapabilityHeaderSchema = z
  .object({
    "x-upload-capability": z.string().min(43).max(256),
  })
  .strict();

export const EvidenceInitiateHeadersSchema = z
  .object({
    "idempotency-key": IdempotencyKeySchema,
    "x-citizen-session": z.string().min(43).max(256),
  })
  .strict();

export const EvidenceFinalizeHeadersSchema =
  EvidenceUploadCapabilityHeaderSchema.extend({
    "x-citizen-session": z.string().min(43).max(256),
  }).strict();

export const EvidenceScanPendingSchema = z
  .object({
    evidence_id: z.string().uuid(),
    state: z.literal("SCAN_PENDING"),
    accepted_at: z.string().datetime(),
  })
  .strict();

export const EvidenceScanRequestedEventDataSchema = z
  .object({
    evidence_id: z.string().uuid(),
    state: z.literal("SCAN_PENDING"),
  })
  .strict();

export const EvidenceReadyEventDataSchema = z
  .object({
    evidence_id: z.string().uuid(),
    state: z.literal("READY"),
    mime: EvidenceMimeSchema,
    size_bytes: z.number().int().positive().safe(),
  })
  .strict();

export const EvidenceScanRequestedEventSchema = eventEnvelopeSchema(
  EvidenceScanRequestedEventDataSchema,
).extend({ type: z.literal(EVENT_ROUTING_KEYS.EVIDENCE_SCAN_REQUESTED) });
export const EvidenceReadyEventSchema = eventEnvelopeSchema(
  EvidenceReadyEventDataSchema,
).extend({ type: z.literal(EVENT_ROUTING_KEYS.EVIDENCE_READY) });

export type InitiateEvidenceUpload = z.infer<
  typeof InitiateEvidenceUploadSchema
>;
export type EvidenceUploadInitiated = z.infer<
  typeof EvidenceUploadInitiatedSchema
>;
export type FinalizeEvidenceUpload = z.infer<
  typeof FinalizeEvidenceUploadSchema
>;
export type EvidenceScanPending = z.infer<typeof EvidenceScanPendingSchema>;
export type EvidenceScanRequestedEventData = z.infer<
  typeof EvidenceScanRequestedEventDataSchema
>;
export type EvidenceReadyEventData = z.infer<
  typeof EvidenceReadyEventDataSchema
>;
