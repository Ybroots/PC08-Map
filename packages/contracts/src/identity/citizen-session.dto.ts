import { z } from "zod";

export const CitizenDeviceClassSchema = z.enum(["mobile", "web"]);

export const CreateCitizenSessionSchema = z
  .object({ device_class: CitizenDeviceClassSchema })
  .strict();

export const CitizenSessionHeaderSchema = z
  .object({
    "x-citizen-session": z.string().min(43).max(128),
  })
  .strict();

export const CitizenSessionSchema = z
  .object({
    session_id: z.string().uuid(),
    session_token: z.string().min(43).max(128),
    device_class: CitizenDeviceClassSchema,
    created_at: z.string().datetime({ offset: true }),
    expires_at: z.string().datetime({ offset: true }),
    rotate_after: z.string().datetime({ offset: true }),
  })
  .strict();

export type CitizenDeviceClass = z.infer<typeof CitizenDeviceClassSchema>;
export type CreateCitizenSession = z.infer<typeof CreateCitizenSessionSchema>;
export type CitizenSessionHeader = z.infer<typeof CitizenSessionHeaderSchema>;
export type CitizenSessionContract = z.infer<typeof CitizenSessionSchema>;
