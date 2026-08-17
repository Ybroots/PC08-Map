import type { SosAcceptedDto } from "@atgt/contracts";
import type { LocationFix, SosQueueEnvelope, SosQueueItem } from "./model";

export interface ClockPort {
  now(): Date;
}

export interface IdentifierPort {
  newUuid(): string;
}

export interface EncryptedSosQueueStore {
  load(): Promise<SosQueueEnvelope>;
  save(envelope: SosQueueEnvelope): Promise<void>;
}

export interface SosTransport {
  send(item: SosQueueItem): Promise<SosAcceptedDto>;
}

export interface LocationPort {
  getCurrentFix(): Promise<LocationFix>;
}

export interface ConnectivityPort {
  isOnline(): Promise<boolean>;
  subscribe(listener: (online: boolean) => void): () => void;
}

export type SosAnalyticsEvent =
  | "SOS_QUEUE_SAVED"
  | "SOS_SEND_STARTED"
  | "SOS_SERVER_ACKNOWLEDGED"
  | "SOS_SEND_FAILED";

/** Events deliberately contain no payload, coordinates, code or identity. */
export interface SosAnalyticsPort {
  record(event: SosAnalyticsEvent): void;
}

export const noOpSosAnalytics: SosAnalyticsPort = {
  record: () => undefined,
};
