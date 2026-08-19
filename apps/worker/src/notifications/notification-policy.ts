import {
  NotificationRequestedEventDataSchema,
  type NotificationRequestedEventData,
} from "@atgt/contracts";
import {
  NotificationPolicyError,
  type NotificationPolicyDecision,
  type NotificationTemplateDefinition,
} from "./notification.types";

const DATA_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const CITIZEN_SAFE_DATA_KEYS = new Set([
  "public_code",
  "status",
  "observed_at",
]);
const FORBIDDEN_DATA_KEYS = new Set([
  "case_notes",
  "coordinate_latitude",
  "coordinate_longitude",
  "description",
  "device_id",
  "email",
  "evidence_url",
  "object_key",
  "password",
  "phone",
  "push_token",
  "recipient_ref",
  "secret",
  "sha256",
  "signed_url",
  "token",
]);

function validateDefinition(definition: NotificationTemplateDefinition): void {
  if (
    !/^[A-Z][A-Z0-9_]{2,63}$/.test(definition.key) ||
    !Number.isSafeInteger(definition.version) ||
    definition.version < 1
  ) {
    throw new NotificationPolicyError("INVALID_TEMPLATE_DEFINITION");
  }
  const keys = [
    ...definition.requiredDataKeys,
    ...(definition.optionalDataKeys ?? []),
  ];
  if (
    keys.length > 12 ||
    new Set(keys).size !== keys.length ||
    keys.some(
      (key) => !DATA_KEY_PATTERN.test(key) || FORBIDDEN_DATA_KEYS.has(key),
    )
  ) {
    throw new NotificationPolicyError("UNSAFE_TEMPLATE_DATA_DEFINITION");
  }
  if (
    definition.audience === "CITIZEN" &&
    keys.some((key) => !CITIZEN_SAFE_DATA_KEYS.has(key))
  ) {
    throw new NotificationPolicyError("UNSAFE_CITIZEN_TEMPLATE_DEFINITION");
  }
}

function validateRequestData(
  request: NotificationRequestedEventData,
  definition: NotificationTemplateDefinition,
): void {
  if (
    request.template_key !== definition.key ||
    request.template_version !== definition.version
  ) {
    throw new NotificationPolicyError("TEMPLATE_VERSION_MISMATCH");
  }
  if (request.audience !== definition.audience) {
    throw new NotificationPolicyError("AUDIENCE_MISMATCH");
  }
  if (request.delivery_class !== definition.deliveryClass) {
    throw new NotificationPolicyError("DELIVERY_CLASS_MISMATCH");
  }
  const actualKeys = Object.keys(request.template_data);
  const allowedKeys = new Set([
    ...definition.requiredDataKeys,
    ...(definition.optionalDataKeys ?? []),
  ]);
  if (
    definition.requiredDataKeys.some((key) => !actualKeys.includes(key)) ||
    actualKeys.some((key) => !allowedKeys.has(key))
  ) {
    throw new NotificationPolicyError("TEMPLATE_DATA_MISMATCH");
  }
}

export function evaluateNotificationPolicy(
  rawRequest: unknown,
  definition: NotificationTemplateDefinition,
  preferenceEnabled: boolean,
): NotificationPolicyDecision {
  const request = NotificationRequestedEventDataSchema.parse(rawRequest);
  validateDefinition(definition);
  validateRequestData(request, definition);
  if (request.delivery_class === "OPTIONAL" && !preferenceEnabled) {
    return { kind: "SUPPRESS", reason: "RECIPIENT_OPT_OUT" };
  }
  return { kind: "DELIVER", request, template: definition };
}
