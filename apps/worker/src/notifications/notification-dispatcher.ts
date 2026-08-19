import {
  NotificationRequestedEventSchema,
  type NotificationRequestedEvent,
} from "@atgt/contracts";
import { evaluateNotificationPolicy } from "./notification-policy";
import {
  NotificationPolicyError,
  NotificationProviderError,
  type InternalNotificationProviderPort,
  type NotificationClaimStorePort,
  type NotificationDeliveryAudit,
  type NotificationDeliveryAuditPort,
  type NotificationDispatchOutcome,
  type NotificationPreferencePort,
  type NotificationTemplateRegistryPort,
} from "./notification.types";

export class NotificationDispatcher {
  constructor(
    private readonly claims: NotificationClaimStorePort,
    private readonly templates: NotificationTemplateRegistryPort,
    private readonly preferences: NotificationPreferencePort,
    private readonly provider: InternalNotificationProviderPort,
    private readonly audits: NotificationDeliveryAuditPort,
  ) {}

  async dispatch(rawEvent: unknown): Promise<NotificationDispatchOutcome> {
    const event = NotificationRequestedEventSchema.parse(rawEvent);
    const request = event.data;
    const claim = await this.claims.claim(
      request.notification_id,
      request.dedupe_key,
    );
    if (claim === "DUPLICATE") {
      await this.audits.record(this.audit(event, "DUPLICATE"));
      return "DUPLICATE";
    }

    let definition;
    try {
      definition = await this.templates.get(
        request.template_key,
        request.template_version,
      );
    } catch (error) {
      await this.claims.release(request.notification_id);
      throw error;
    }
    if (!definition) {
      await this.reject(event);
      return "REJECTED";
    }

    let decision;
    try {
      const preferenceEnabled = await this.preferences.isEnabled(
        request.recipient_ref,
        request.template_key,
      );
      decision = evaluateNotificationPolicy(
        request,
        definition,
        preferenceEnabled,
      );
    } catch (error) {
      if (!(error instanceof NotificationPolicyError)) {
        await this.claims.release(request.notification_id);
        throw error;
      }
      await this.reject(event);
      return "REJECTED";
    }

    if (decision.kind === "SUPPRESS") {
      await this.finalize(event, "SUPPRESSED");
      return "SUPPRESSED";
    }

    try {
      await this.provider.deliver({
        notificationId: request.notification_id,
        idempotencyKey: request.dedupe_key,
        recipientRef: request.recipient_ref,
        templateKey: request.template_key,
        templateVersion: request.template_version,
        templateData: request.template_data,
      });
    } catch (error) {
      if (!(error instanceof NotificationProviderError)) {
        await this.claims.release(request.notification_id);
        throw error;
      }
      if (error.retryable) {
        try {
          await this.audits.record(
            this.audit(event, "RETRYABLE_FAILURE", error.code),
          );
        } finally {
          await this.claims.release(request.notification_id);
        }
        throw error;
      }
      await this.finalize(event, "PERMANENT_FAILURE", error.code);
      return "PERMANENT_FAILURE";
    }

    await this.finalize(event, "DELIVERED");
    return "DELIVERED";
  }

  private async reject(event: NotificationRequestedEvent): Promise<void> {
    await this.finalize(event, "REJECTED", "POLICY_REJECTED");
  }

  private async finalize(
    event: NotificationRequestedEvent,
    outcome: NotificationDeliveryAudit["outcome"],
    errorCode?: NotificationDeliveryAudit["errorCode"],
  ): Promise<void> {
    try {
      await this.audits.record(this.audit(event, outcome, errorCode));
      await this.claims.complete(event.data.notification_id);
    } catch (error) {
      await this.claims.release(event.data.notification_id);
      throw error;
    }
  }

  private audit(
    event: NotificationRequestedEvent,
    outcome: NotificationDeliveryAudit["outcome"],
    errorCode?: NotificationDeliveryAudit["errorCode"],
  ): NotificationDeliveryAudit {
    return {
      notificationId: event.data.notification_id,
      eventId: event.event_id,
      audience: event.data.audience,
      channel: "INTERNAL",
      templateKey: event.data.template_key,
      templateVersion: event.data.template_version,
      outcome,
      ...(errorCode ? { errorCode } : {}),
    };
  }
}
