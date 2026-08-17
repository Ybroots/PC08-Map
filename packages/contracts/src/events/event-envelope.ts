import { z } from "zod";

export const EVENT_ROUTING_KEYS = {
  INCIDENT_RECEIVED: "incident.received.v1",
  INCIDENT_VERIFIED: "incident.verified.v1",
  ASSIGNMENT_CREATED: "assignment.created.v1",
  ASSIGNMENT_ACK_TIMED_OUT: "assignment.ack_timed_out.v1",
  EVIDENCE_SCAN_REQUESTED: "evidence.scan_requested.v1",
  EVIDENCE_READY: "evidence.ready.v1",
  MAP_VERSION_PUBLISHED: "map.version.published.v1",
  MAP_VERSION_EXPIRED: "map.version.expired.v1",
  MAP_CACHE_INVALIDATE: "map.cache.invalidate.v1",
  NOTIFICATION_REQUESTED: "notification.requested.v1",
  PROVIDER_QUOTA_THRESHOLD: "provider.quota_threshold.v1",
} as const;

export type EventRoutingKey =
  (typeof EVENT_ROUTING_KEYS)[keyof typeof EVENT_ROUTING_KEYS];

const routingKeyValues = Object.values(EVENT_ROUTING_KEYS) as [
  EventRoutingKey,
  ...EventRoutingKey[],
];

export const EventRoutingKeySchema = z.enum(routingKeyValues);

export const EventEnvelopeSchema = z
  .object({
    event_id: z.string().uuid(),
    type: EventRoutingKeySchema,
    version: z.number().int().positive(),
    occurred_at: z.string().datetime(),
    trace_id: z.string().regex(/^[0-9a-f]{32}$/),
    aggregate_id: z.string().min(1).max(200),
    aggregate_type: z.string().min(1).max(100),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

export type EventEnvelope<
  T extends Record<string, unknown> = Record<string, unknown>,
> = Omit<z.infer<typeof EventEnvelopeSchema>, "data"> & { data: T };

export function eventEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return EventEnvelopeSchema.extend({ data: dataSchema });
}
