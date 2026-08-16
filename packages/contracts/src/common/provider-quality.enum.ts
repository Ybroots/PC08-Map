import { z } from "zod";

export const ProviderQuality = {
  LIVE: "LIVE",
  CACHED: "CACHED",
  DEGRADED: "DEGRADED",
  UNAVAILABLE: "UNAVAILABLE",
} as const;

export const ProviderQualitySchema = z.enum([
  ProviderQuality.LIVE,
  ProviderQuality.CACHED,
  ProviderQuality.DEGRADED,
  ProviderQuality.UNAVAILABLE,
]);

export type ProviderQuality = z.infer<typeof ProviderQualitySchema>;
