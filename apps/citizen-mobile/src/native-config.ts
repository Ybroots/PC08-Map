import type { SosIncidentTypeOption } from "./features/sos/SosScreen";
import { DEFAULT_SOS_INCIDENT_TYPES } from "./features/sos/SosScreen";

export const DEVELOPMENT_NATIVE_APPLICATION_ID = "com.atgtlamdong.dev";

export interface NativeSosBootstrapConfig {
  readonly apiBaseUrl: string;
  readonly incidentTypes: readonly SosIncidentTypeOption[];
}

/**
 * Production intentionally returns undefined until the approved bundle ID,
 * HTTPS endpoint and incident catalog are injected by a release configuration.
 */
export function resolveNativeSosBootstrapConfig(
  development: boolean,
  platform: string,
): NativeSosBootstrapConfig | undefined {
  if (!development) return undefined;
  const apiBaseUrl =
    platform === "android"
      ? "http://10.0.2.2:3000"
      : platform === "ios"
        ? "http://localhost:3000"
        : undefined;
  if (!apiBaseUrl) return undefined;
  return {
    apiBaseUrl,
    incidentTypes: DEFAULT_SOS_INCIDENT_TYPES,
  };
}
