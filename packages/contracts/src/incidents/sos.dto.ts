import { z } from "zod";
import { IdempotencyKeySchema } from "../common/idempotency";
import {
  EVENT_ROUTING_KEYS,
  eventEnvelopeSchema,
} from "../events/event-envelope";

export const IncidentStateSchema = z.enum([
  "RECEIVED",
  "AUTO_SCREENING",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "ASSIGNED",
  "ACKNOWLEDGED",
  "EN_ROUTE",
  "ON_SCENE",
  "RESOLVED",
  "CLOSED",
  "REJECTED",
  "DUPLICATE",
  "ESCALATED",
  "REASSIGNED",
  "CANCELLED",
]);
export type IncidentStateValue = z.infer<typeof IncidentStateSchema>;

export const SosIdempotencyHeadersSchema = z
  .object({ "idempotency-key": IdempotencyKeySchema })
  .strict();
export type SosIdempotencyHeaders = z.infer<typeof SosIdempotencyHeadersSchema>;

export const CreateSosSchema = z
  .object({
    coordinateLongitude: z.number().finite().min(-180).max(180),
    coordinateLatitude: z.number().finite().min(-90).max(90),
    accuracyMeters: z.number().finite().nonnegative().max(10_000),
    incidentType: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
    description: z.string().trim().min(1).max(500).optional(),
    clientEventAt: z.string().datetime(),
  })
  .strict();

export type CreateSosDto = z.infer<typeof CreateSosSchema>;

export const PublicIncidentStatusSchema = z.enum([
  "RECEIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "INSUFFICIENT_BASIS",
]);
export type PublicIncidentStatus = z.infer<typeof PublicIncidentStatusSchema>;

export const EmergencyContactSchema = z
  .object({
    name: z.string().min(1),
    number: z.enum(["112", "113", "114", "115"]),
    type: z.enum(["112", "113", "114", "115"]),
  })
  .strict()
  .refine((contact) => contact.number === contact.type, {
    message: "Emergency contact number and type must match",
  });

export type EmergencyContact = z.infer<typeof EmergencyContactSchema>;

export const SosAcceptedSchema = z
  .object({
    publicCode: z.string().regex(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/),
    status: PublicIncidentStatusSchema,
    receivedAt: z.string().datetime(),
    emergencyContacts: z.array(EmergencyContactSchema).min(1),
  })
  .strict();

export type SosAcceptedDto = z.infer<typeof SosAcceptedSchema>;

export const PublicIncidentTrackingSchema = z
  .object({
    publicCode: z.string().regex(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/),
    status: PublicIncidentStatusSchema,
    receivedAt: z.string().datetime(),
    lastUpdatedAt: z.string().datetime(),
  })
  .strict();
export type PublicIncidentTracking = z.infer<
  typeof PublicIncidentTrackingSchema
>;

export const OpsIncidentTransitionRequestSchema = z
  .object({
    toState: IncidentStateSchema,
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type OpsIncidentTransitionRequest = z.infer<
  typeof OpsIncidentTransitionRequestSchema
>;

export const OpsIncidentSchema = z
  .object({
    id: z.string().uuid(),
    publicCode: z.string().regex(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/),
    incidentType: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
    priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
    coordinateLongitude: z.number().finite().min(-180).max(180),
    coordinateLatitude: z.number().finite().min(-90).max(90),
    accuracyMeters: z.number().finite().nonnegative().max(10_000),
    description: z.string().min(1).max(500).optional(),
    occurredAt: z.string().datetime(),
    receivedAt: z.string().datetime(),
    state: IncidentStateSchema,
    areaId: z.string().min(1).max(100),
    version: z.number().int().positive(),
  })
  .strict();
export type OpsIncident = z.infer<typeof OpsIncidentSchema>;

export const OpsIncidentFeedQuerySchema = z
  .object({
    after: z.string().regex(/^\d+$/).default("0"),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type OpsIncidentFeedQuery = z.infer<typeof OpsIncidentFeedQuerySchema>;

export const OpsIncidentFeedItemSchema = z
  .object({
    cursor: z.string().regex(/^\d+$/),
    fromState: IncidentStateSchema.nullable(),
    toState: IncidentStateSchema,
    changedAt: z.string().datetime(),
    incident: OpsIncidentSchema,
  })
  .strict();

export const OpsIncidentFeedSchema = z
  .object({
    items: z.array(OpsIncidentFeedItemSchema),
    nextCursor: z.string().regex(/^\d+$/),
    hasMore: z.boolean(),
  })
  .strict();
export type OpsIncidentFeed = z.infer<typeof OpsIncidentFeedSchema>;

export const IncidentReceivedEventDataSchema = z
  .object({
    incident_id: z.string().uuid(),
    incident_type: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
    priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
    area_id: z.string().min(1).max(100),
    state: z.literal("RECEIVED"),
  })
  .strict();
export type IncidentReceivedEventData = z.infer<
  typeof IncidentReceivedEventDataSchema
>;

export const IncidentReceivedEventSchema = eventEnvelopeSchema(
  IncidentReceivedEventDataSchema,
)
  .extend({
    type: z.literal(EVENT_ROUTING_KEYS.INCIDENT_RECEIVED),
    version: z.literal(1),
    aggregate_type: z.literal("incident"),
  })
  .superRefine((event, context) => {
    if (event.aggregate_id !== event.data.incident_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aggregate_id"],
        message: "Incident aggregate_id must equal incident_id",
      });
    }
  });
export type IncidentReceivedEvent = z.infer<typeof IncidentReceivedEventSchema>;

export const EMERGENCY_CONTACTS: readonly EmergencyContact[] = [
  { name: "Cuu nan - Cuu ho", number: "112", type: "112" },
  { name: "Canh sat 113", number: "113", type: "113" },
  { name: "Phong chay chua chay 114", number: "114", type: "114" },
  { name: "Cap cuu 115", number: "115", type: "115" },
] as const;
