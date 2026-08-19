import { z } from "zod";
import {
  EVENT_ROUTING_KEYS,
  eventEnvelopeSchema,
} from "../events/event-envelope";

export const NotificationAudienceSchema = z.enum([
  "CITIZEN",
  "INTERNAL_OPERATOR",
]);
export type NotificationAudience = z.infer<typeof NotificationAudienceSchema>;

export const NotificationDeliveryClassSchema = z.enum([
  "OPTIONAL",
  "MANDATORY",
]);
export type NotificationDeliveryClass = z.infer<
  typeof NotificationDeliveryClassSchema
>;

export const NotificationChannelSchema = z.literal("INTERNAL");
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

const TemplateKeySchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);
const DedupeKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const TemplateDataValueSchema = z.union([
  z
    .string()
    .max(200)
    .refine(
      (value) =>
        [...value].every((character) => {
          const code = character.codePointAt(0)!;
          return code > 31 && code !== 127;
        }),
      { message: "Template data contains a control character" },
    ),
  z.number().finite(),
  z.boolean(),
]);

export const CitizenNotificationTemplateDataSchema = z
  .object({
    public_code: z
      .string()
      .regex(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/)
      .optional(),
    status: z
      .enum(["RECEIVED", "IN_PROGRESS", "COMPLETED", "INSUFFICIENT_BASIS"])
      .optional(),
    observed_at: z.string().datetime().optional(),
  })
  .strict();

export const InternalNotificationTemplateDataSchema = z
  .record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), TemplateDataValueSchema)
  .refine((data) => Object.keys(data).length <= 12, {
    message: "Internal notification template data exceeds 12 keys",
  });

const NotificationRequestBase = {
  notification_id: z.string().uuid(),
  dedupe_key: DedupeKeySchema,
  recipient_ref: z.string().uuid(),
  channel: NotificationChannelSchema,
  template_key: TemplateKeySchema,
  template_version: z.number().int().positive(),
  delivery_class: NotificationDeliveryClassSchema,
} as const;

export const CitizenNotificationRequestedDataSchema = z
  .object({
    ...NotificationRequestBase,
    audience: z.literal("CITIZEN"),
    template_data: CitizenNotificationTemplateDataSchema,
  })
  .strict();

export const InternalNotificationRequestedDataSchema = z
  .object({
    ...NotificationRequestBase,
    audience: z.literal("INTERNAL_OPERATOR"),
    template_data: InternalNotificationTemplateDataSchema,
  })
  .strict();

export const NotificationRequestedEventDataSchema = z.discriminatedUnion(
  "audience",
  [
    CitizenNotificationRequestedDataSchema,
    InternalNotificationRequestedDataSchema,
  ],
);
export type NotificationRequestedEventData = z.infer<
  typeof NotificationRequestedEventDataSchema
>;

export const NotificationRequestedEventSchema = eventEnvelopeSchema(
  NotificationRequestedEventDataSchema,
)
  .extend({
    type: z.literal(EVENT_ROUTING_KEYS.NOTIFICATION_REQUESTED),
    version: z.literal(1),
    aggregate_type: z.literal("notification"),
  })
  .superRefine((event, context) => {
    if (event.aggregate_id !== event.data.notification_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aggregate_id"],
        message: "Notification aggregate_id must equal notification_id",
      });
    }
  });
export type NotificationRequestedEvent = z.infer<
  typeof NotificationRequestedEventSchema
>;
