import {
  CreateSosSchema,
  IdempotencyKeySchema,
  SosAcceptedSchema,
  type CreateSosDto,
  type SosAcceptedDto,
} from "@atgt/contracts";
import { z } from "zod";

export const SOS_QUEUE_VERSION = 1 as const;

export const DeliveryStateSchema = z.enum([
  "SAVED_ON_DEVICE",
  "SENDING",
  "SERVER_ACKNOWLEDGED",
  "SEND_FAILED",
]);
export type DeliveryState = z.infer<typeof DeliveryStateSchema>;

export const SosQueueItemSchema = z
  .object({
    clientEventId: z.string().uuid(),
    idempotencyKey: IdempotencyKeySchema,
    createdAt: z.string().datetime(),
    retryCount: z.number().int().nonnegative(),
    mediaChecksum: z.null(),
    deliveryState: DeliveryStateSchema,
    payload: CreateSosSchema,
    acknowledgement: SosAcceptedSchema.optional(),
    lastErrorCode: z
      .enum([
        "NETWORK_UNAVAILABLE",
        "HTTP_RETRYABLE",
        "HTTP_REJECTED",
        "INVALID_ACKNOWLEDGEMENT",
      ])
      .optional(),
  })
  .strict()
  .superRefine((item, context) => {
    const acknowledged = item.deliveryState === "SERVER_ACKNOWLEDGED";
    if (acknowledged !== Boolean(item.acknowledgement)) {
      context.addIssue({
        code: "custom",
        message: "Only server-acknowledged items may contain acknowledgement",
        path: ["acknowledgement"],
      });
    }
  });

export type SosQueueItem = z.infer<typeof SosQueueItemSchema>;

export const SosQueueEnvelopeSchema = z
  .object({
    version: z.literal(SOS_QUEUE_VERSION),
    items: z.array(SosQueueItemSchema),
  })
  .strict();
export type SosQueueEnvelope = z.infer<typeof SosQueueEnvelopeSchema>;

export interface LocationFix {
  readonly coordinateLongitude: number;
  readonly coordinateLatitude: number;
  readonly accuracyMeters: number;
  readonly capturedAt: string;
}

export interface LocationQualityPolicy {
  readonly staleAfterMs: number;
  readonly lowAccuracyAboveMeters: number;
}

export const DEFAULT_LOCATION_QUALITY_POLICY: LocationQualityPolicy = {
  staleAfterMs: 30_000,
  lowAccuracyAboveMeters: 100,
};

export class LocationUnavailableError extends Error {
  constructor(readonly code: "PERMISSION_DENIED" | "POSITION_UNAVAILABLE") {
    super(code);
    this.name = "LocationUnavailableError";
  }
}

export interface LocationQuality {
  readonly ageMs: number;
  readonly isStale: boolean;
  readonly isLowAccuracy: boolean;
}

export function assessLocationQuality(
  fix: LocationFix,
  now: Date,
  policy: LocationQualityPolicy,
): LocationQuality {
  const capturedAt = Date.parse(fix.capturedAt);
  if (!Number.isFinite(capturedAt)) {
    throw new Error("LOCATION_TIMESTAMP_INVALID");
  }
  if (
    !Number.isFinite(policy.staleAfterMs) ||
    policy.staleAfterMs < 0 ||
    !Number.isFinite(policy.lowAccuracyAboveMeters) ||
    policy.lowAccuracyAboveMeters < 0
  ) {
    throw new Error("LOCATION_POLICY_INVALID");
  }
  const ageMs = Math.max(0, now.getTime() - capturedAt);
  return {
    ageMs,
    isStale: ageMs > policy.staleAfterMs,
    isLowAccuracy: fix.accuracyMeters > policy.lowAccuracyAboveMeters,
  };
}

export interface SosSubmissionInput {
  readonly fix: LocationFix;
  readonly incidentType: string;
  readonly description?: string;
}

export function toCreateSosDto(input: SosSubmissionInput): CreateSosDto {
  return CreateSosSchema.parse({
    coordinateLongitude: input.fix.coordinateLongitude,
    coordinateLatitude: input.fix.coordinateLatitude,
    accuracyMeters: input.fix.accuracyMeters,
    incidentType: input.incidentType,
    description: input.description?.trim() || undefined,
    clientEventAt: input.fix.capturedAt,
  });
}

export function withAcknowledgement(
  item: SosQueueItem,
  acknowledgement: SosAcceptedDto,
): SosQueueItem {
  return SosQueueItemSchema.parse({
    ...item,
    deliveryState: "SERVER_ACKNOWLEDGED",
    acknowledgement,
    lastErrorCode: undefined,
  });
}
