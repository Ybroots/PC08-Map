import { EVENT_ROUTING_KEYS } from "@atgt/contracts";
import { NotificationDispatcher } from "./notification-dispatcher";
import {
  NotificationProviderError,
  type InternalNotificationProviderPort,
  type NotificationClaimStorePort,
  type NotificationDeliveryAudit,
  type NotificationDeliveryAuditPort,
  type NotificationPreferencePort,
  type NotificationTemplateDefinition,
  type NotificationTemplateRegistryPort,
} from "./notification.types";

const eventId = "550e8400-e29b-41d4-a716-446655440000";
const notificationId = "650e8400-e29b-41d4-a716-446655440000";
const recipientRef = "750e8400-e29b-41d4-a716-446655440000";

const optionalCitizenTemplate: NotificationTemplateDefinition = {
  key: "SYNTHETIC_STATUS",
  version: 1,
  audience: "CITIZEN",
  deliveryClass: "OPTIONAL",
  requiredDataKeys: ["status"],
  optionalDataKeys: ["public_code", "observed_at"],
};

function event(
  overrides: Record<string, unknown> = {},
  dataOverrides: Record<string, unknown> = {},
) {
  return {
    event_id: eventId,
    type: EVENT_ROUTING_KEYS.NOTIFICATION_REQUESTED,
    version: 1,
    occurred_at: "2026-08-19T10:00:00.000Z",
    trace_id: "0123456789abcdef0123456789abcdef",
    aggregate_id: notificationId,
    aggregate_type: "notification",
    data: {
      notification_id: notificationId,
      dedupe_key: "notification.synthetic.v1",
      recipient_ref: recipientRef,
      audience: "CITIZEN",
      channel: "INTERNAL",
      template_key: "SYNTHETIC_STATUS",
      template_version: 1,
      delivery_class: "OPTIONAL",
      template_data: { status: "IN_PROGRESS" },
      ...dataOverrides,
    },
    ...overrides,
  };
}

function setup(
  template: NotificationTemplateDefinition | null = optionalCitizenTemplate,
) {
  const claims: jest.Mocked<NotificationClaimStorePort> = {
    claim: jest.fn().mockResolvedValue("CLAIMED"),
    complete: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
  const templates: jest.Mocked<NotificationTemplateRegistryPort> = {
    get: jest.fn().mockResolvedValue(template),
  };
  const preferences: jest.Mocked<NotificationPreferencePort> = {
    isEnabled: jest.fn().mockResolvedValue(true),
  };
  const provider: jest.Mocked<InternalNotificationProviderPort> = {
    channel: "INTERNAL",
    deliver: jest.fn().mockResolvedValue(undefined),
  };
  const recorded: NotificationDeliveryAudit[] = [];
  const audits: NotificationDeliveryAuditPort = {
    record: jest.fn(async (audit) => {
      recorded.push(audit);
    }),
  };
  return {
    claims,
    templates,
    preferences,
    provider,
    audits,
    recorded,
    dispatcher: new NotificationDispatcher(
      claims,
      templates,
      preferences,
      provider,
      audits,
    ),
  };
}

describe("NotificationDispatcher internal-only foundation", () => {
  it("delivers an allowlisted request with provider idempotency", async () => {
    const harness = setup();
    await expect(harness.dispatcher.dispatch(event())).resolves.toBe(
      "DELIVERED",
    );
    expect(harness.provider.deliver).toHaveBeenCalledWith({
      notificationId,
      idempotencyKey: "notification.synthetic.v1",
      recipientRef,
      templateKey: "SYNTHETIC_STATUS",
      templateVersion: 1,
      templateData: { status: "IN_PROGRESS" },
    });
    expect(harness.claims.complete).toHaveBeenCalledWith(notificationId);
    expect(harness.claims.release).not.toHaveBeenCalled();
    expect(JSON.stringify(harness.recorded)).not.toMatch(
      /recipientRef|IN_PROGRESS|public_code/,
    );
  });

  it("deduplicates before template or provider access", async () => {
    const harness = setup();
    harness.claims.claim.mockResolvedValue("DUPLICATE");
    await expect(harness.dispatcher.dispatch(event())).resolves.toBe(
      "DUPLICATE",
    );
    expect(harness.templates.get).not.toHaveBeenCalled();
    expect(harness.provider.deliver).not.toHaveBeenCalled();
    expect(harness.recorded[0]?.outcome).toBe("DUPLICATE");
  });

  it("rejects wrong-audience and unsafe citizen template definitions", async () => {
    const definitions: NotificationTemplateDefinition[] = [
      { ...optionalCitizenTemplate, audience: "INTERNAL_OPERATOR" },
      {
        ...optionalCitizenTemplate,
        requiredDataKeys: ["status", "area_id"],
        optionalDataKeys: [],
      },
    ];
    for (const definition of definitions) {
      const harness = setup(definition);
      await expect(harness.dispatcher.dispatch(event())).resolves.toBe(
        "REJECTED",
      );
      expect(harness.provider.deliver).not.toHaveBeenCalled();
      expect(harness.recorded[0]).toMatchObject({
        outcome: "REJECTED",
        errorCode: "POLICY_REJECTED",
      });
      expect(harness.claims.complete).toHaveBeenCalledWith(notificationId);
    }
  });

  it("honors optional opt-out but does not suppress an explicit mandatory class", async () => {
    const optionalHarness = setup();
    optionalHarness.preferences.isEnabled.mockResolvedValue(false);
    await expect(optionalHarness.dispatcher.dispatch(event())).resolves.toBe(
      "SUPPRESSED",
    );
    expect(optionalHarness.provider.deliver).not.toHaveBeenCalled();

    const mandatoryTemplate: NotificationTemplateDefinition = {
      ...optionalCitizenTemplate,
      deliveryClass: "MANDATORY",
    };
    const mandatoryHarness = setup(mandatoryTemplate);
    mandatoryHarness.preferences.isEnabled.mockResolvedValue(false);
    await expect(
      mandatoryHarness.dispatcher.dispatch(
        event({}, { delivery_class: "MANDATORY" }),
      ),
    ).resolves.toBe("DELIVERED");
    expect(mandatoryHarness.provider.deliver).toHaveBeenCalledTimes(1);
  });

  it.each(["RATE_LIMITED", "UNAVAILABLE"] as const)(
    "releases retryable provider failure %s for queue retry",
    async (code) => {
      const harness = setup();
      const failure = new NotificationProviderError(code);
      harness.provider.deliver.mockRejectedValue(failure);
      await expect(harness.dispatcher.dispatch(event())).rejects.toBe(failure);
      expect(harness.claims.release).toHaveBeenCalledWith(notificationId);
      expect(harness.claims.complete).not.toHaveBeenCalled();
      expect(harness.recorded[0]).toMatchObject({
        outcome: "RETRYABLE_FAILURE",
        errorCode: code,
      });
    },
  );

  it("completes a permanent provider rejection without retry", async () => {
    const harness = setup();
    harness.provider.deliver.mockRejectedValue(
      new NotificationProviderError("REJECTED"),
    );
    await expect(harness.dispatcher.dispatch(event())).resolves.toBe(
      "PERMANENT_FAILURE",
    );
    expect(harness.claims.complete).toHaveBeenCalledWith(notificationId);
    expect(harness.claims.release).not.toHaveBeenCalled();
    expect(harness.recorded[0]).toMatchObject({
      outcome: "PERMANENT_FAILURE",
      errorCode: "REJECTED",
    });
  });

  it("rejects an unknown template without calling preference or provider", async () => {
    const harness = setup(null);
    await expect(harness.dispatcher.dispatch(event())).resolves.toBe(
      "REJECTED",
    );
    expect(harness.preferences.isEnabled).not.toHaveBeenCalled();
    expect(harness.provider.deliver).not.toHaveBeenCalled();
  });

  it("releases its claim when template registry or delivery audit is unavailable", async () => {
    const registryHarness = setup();
    const registryFailure = new Error("synthetic registry outage");
    registryHarness.templates.get.mockRejectedValue(registryFailure);
    await expect(registryHarness.dispatcher.dispatch(event())).rejects.toBe(
      registryFailure,
    );
    expect(registryHarness.claims.release).toHaveBeenCalledWith(notificationId);

    const auditHarness = setup();
    const auditFailure = new Error("synthetic audit outage");
    jest.mocked(auditHarness.audits.record).mockRejectedValueOnce(auditFailure);
    await expect(auditHarness.dispatcher.dispatch(event())).rejects.toBe(
      auditFailure,
    );
    expect(auditHarness.provider.deliver).toHaveBeenCalledTimes(1);
    expect(auditHarness.claims.release).toHaveBeenCalledWith(notificationId);
    expect(auditHarness.claims.complete).not.toHaveBeenCalled();
  });
});
