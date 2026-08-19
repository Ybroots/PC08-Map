import type {
  NotificationAudience,
  NotificationDeliveryClass,
  NotificationRequestedEventData,
} from "@atgt/contracts";

export type NotificationTemplateDefinition = Readonly<{
  key: string;
  version: number;
  audience: NotificationAudience;
  deliveryClass: NotificationDeliveryClass;
  requiredDataKeys: readonly string[];
  optionalDataKeys?: readonly string[];
}>;

export type NotificationPolicyDecision =
  | Readonly<{
      kind: "DELIVER";
      request: NotificationRequestedEventData;
      template: NotificationTemplateDefinition;
    }>
  | Readonly<{
      kind: "SUPPRESS";
      reason: "RECIPIENT_OPT_OUT";
    }>;

export type NotificationDispatchOutcome =
  "DELIVERED" | "SUPPRESSED" | "DUPLICATE" | "REJECTED" | "PERMANENT_FAILURE";

export type NotificationDeliveryAuditOutcome =
  NotificationDispatchOutcome | "RETRYABLE_FAILURE";

export type NotificationDeliveryAudit = Readonly<{
  notificationId: string;
  eventId: string;
  audience: NotificationAudience;
  channel: "INTERNAL";
  templateKey: string;
  templateVersion: number;
  outcome: NotificationDeliveryAuditOutcome;
  errorCode?: NotificationProviderErrorCode | "POLICY_REJECTED";
}>;

export interface NotificationClaimStorePort {
  claim(
    notificationId: string,
    dedupeKey: string,
  ): Promise<"CLAIMED" | "DUPLICATE">;
  complete(notificationId: string): Promise<void>;
  release(notificationId: string): Promise<void>;
}

export interface NotificationTemplateRegistryPort {
  get(
    key: string,
    version: number,
  ): Promise<NotificationTemplateDefinition | null>;
}

export interface NotificationPreferencePort {
  isEnabled(recipientRef: string, templateKey: string): Promise<boolean>;
}

export type InternalNotificationDelivery = Readonly<{
  notificationId: string;
  idempotencyKey: string;
  recipientRef: string;
  templateKey: string;
  templateVersion: number;
  templateData: Readonly<Record<string, string | number | boolean>>;
}>;

export interface InternalNotificationProviderPort {
  readonly channel: "INTERNAL";
  deliver(delivery: InternalNotificationDelivery): Promise<void>;
}

export interface NotificationDeliveryAuditPort {
  record(audit: NotificationDeliveryAudit): Promise<void>;
}

export type NotificationProviderErrorCode =
  "RATE_LIMITED" | "UNAVAILABLE" | "REJECTED";

export class NotificationProviderError extends Error {
  readonly retryable: boolean;

  constructor(readonly code: NotificationProviderErrorCode) {
    super(`Internal notification provider failed: ${code}`);
    this.name = "NotificationProviderError";
    this.retryable = code === "RATE_LIMITED" || code === "UNAVAILABLE";
  }
}

export class NotificationPolicyError extends Error {
  constructor(readonly code: string) {
    super(`Notification policy rejected request: ${code}`);
    this.name = "NotificationPolicyError";
  }
}
