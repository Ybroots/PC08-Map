import { z } from "zod";

/** Transport-neutral key; an API route decides whether it comes from header or body. */
export const IdempotencyKeySchema = z.string().uuid();
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
