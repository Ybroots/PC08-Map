import { z } from "zod";
import { IdempotencyKeySchema } from "../common/idempotency";

export const CreateSosSchema = z
  .object({
    coordinateLongitude: z.number().finite().min(-180).max(180),
    coordinateLatitude: z.number().finite().min(-90).max(90),
    accuracyMeters: z.number().finite().nonnegative().max(10_000),
    idempotencyKey: IdempotencyKeySchema,
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

export const EMERGENCY_CONTACTS: readonly EmergencyContact[] = [
  { name: "Cuu nan - Cuu ho", number: "112", type: "112" },
  { name: "Canh sat 113", number: "113", type: "113" },
  { name: "Phong chay chua chay 114", number: "114", type: "114" },
  { name: "Cap cuu 115", number: "115", type: "115" },
] as const;
