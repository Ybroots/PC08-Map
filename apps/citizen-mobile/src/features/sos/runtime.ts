import type { FetchPort } from "./api-client";
import { FetchSosTransport } from "./api-client";
import { NativeConnectivityPort } from "./connectivity";
import { secureUuidIdentifiers } from "./identifiers";
import {
  KeychainSosQueueStore,
  NativeKeychainCredentialStore,
} from "./keychain-store";
import { NativeLocationPort } from "./location";
import type { SosAnalyticsPort } from "./ports";
import { noOpSosAnalytics } from "./ports";
import { SosSubmissionService } from "./submission-service";
import type { SosIncidentTypeOption } from "./SosScreen";

export interface NativeSosRuntimeConfig {
  readonly apiBaseUrl: string;
  readonly incidentTypes: readonly SosIncidentTypeOption[];
  readonly analytics?: SosAnalyticsPort;
  readonly fetcher?: FetchPort;
}

export function createNativeSosRuntime(config: NativeSosRuntimeConfig) {
  if (!config.apiBaseUrl.trim()) throw new Error("SOS_API_BASE_URL_REQUIRED");
  if (
    config.incidentTypes.length === 0 ||
    config.incidentTypes.some(
      (type) => !/^[A-Z][A-Z0-9_]{1,63}$/.test(type.code) || !type.label.trim(),
    ) ||
    new Set(config.incidentTypes.map((type) => type.code)).size !==
      config.incidentTypes.length
  ) {
    throw new Error("SOS_INCIDENT_TYPES_INVALID");
  }
  const fetcher: FetchPort =
    config.fetcher ??
    (async (input, init) => {
      const response = await fetch(input, init);
      return { status: response.status, json: () => response.json() };
    });
  const store = new KeychainSosQueueStore(new NativeKeychainCredentialStore());
  return {
    connectivity: new NativeConnectivityPort(),
    incidentTypes: config.incidentTypes,
    location: new NativeLocationPort(),
    submission: new SosSubmissionService(
      store,
      new FetchSosTransport(config.apiBaseUrl, fetcher),
      secureUuidIdentifiers,
      { now: () => new Date() },
      config.analytics ?? noOpSosAnalytics,
    ),
  } as const;
}
