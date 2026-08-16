import {
  CreateSosSchema,
  CreateCitizenSessionSchema,
  CitizenSessionSchema,
  ERROR_CODES,
  EVENT_ROUTING_KEYS,
  EmergencyContactSchema,
  EventEnvelopeSchema,
  ProblemDetailsSchema,
  ProviderQuality,
  ProviderQualitySchema,
  SosAcceptedSchema,
} from "./index";

const traceId = "0123456789abcdef0123456789abcdef";
const uuid = "550e8400-e29b-41d4-a716-446655440000";

describe("executable contracts", () => {
  it("accepts a valid SOS request and strips no unknown data", () => {
    const payload = {
      coordinateLongitude: 108.4384,
      coordinateLatitude: 11.9404,
      accuracyMeters: 12.5,
      idempotencyKey: uuid,
      incidentType: "TRAFFIC_ACCIDENT",
      description: "Can ho tro",
      clientEventAt: "2026-08-16T10:00:00.000Z",
    };
    expect(CreateSosSchema.parse(payload)).toEqual(payload);
  });

  it.each([
    { coordinateLongitude: Number.NaN },
    { coordinateLongitude: 181 },
    { coordinateLatitude: -91 },
    { accuracyMeters: -1 },
    { idempotencyKey: "predictable-key" },
    { incidentType: "traffic accident" },
    { description: "x".repeat(501) },
  ])("rejects an invalid SOS boundary: %o", (override) => {
    expect(() =>
      CreateSosSchema.parse({
        coordinateLongitude: 108.4384,
        coordinateLatitude: 11.9404,
        accuracyMeters: 12.5,
        idempotencyKey: uuid,
        incidentType: "TRAFFIC_ACCIDENT",
        clientEventAt: "2026-08-16T10:00:00.000Z",
        ...override,
      }),
    ).toThrow();
  });

  it("rejects unknown fields at the public boundary", () => {
    expect(() =>
      CreateSosSchema.parse({
        coordinateLongitude: 108.4384,
        coordinateLatitude: 11.9404,
        accuracyMeters: 12.5,
        idempotencyKey: uuid,
        incidentType: "TRAFFIC_ACCIDENT",
        clientEventAt: "2026-08-16T10:00:00.000Z",
        citizenIdentity: "must-not-enter-incident-contract",
      }),
    ).toThrow();
  });

  it("validates Problem Details extensions", () => {
    expect(
      ProblemDetailsSchema.parse({
        type: "https://atgt.local/problems/validation-failed",
        title: "Validation failed",
        status: 400,
        detail: "Request validation failed",
        error_code: ERROR_CODES.VALIDATION_FAILED,
        trace_id: traceId,
      }),
    ).toBeDefined();
  });

  it("validates event routing keys and envelope data", () => {
    const event = EventEnvelopeSchema.parse({
      event_id: uuid,
      type: EVENT_ROUTING_KEYS.INCIDENT_RECEIVED,
      version: 1,
      occurred_at: "2026-08-16T10:00:00.000Z",
      trace_id: traceId,
      aggregate_id: uuid,
      aggregate_type: "incident",
      data: { public_code: "A3KX9M2P7Q4R" },
    });
    expect(event.type).toBe(EVENT_ROUTING_KEYS.INCIDENT_RECEIVED);
  });

  it("keeps provider quality runtime and TypeScript values aligned", () => {
    expect(ProviderQualitySchema.parse(ProviderQuality.DEGRADED)).toBe(
      "DEGRADED",
    );
    expect(() => ProviderQualitySchema.parse("STALE")).toThrow();
  });

  it("requires emergency contact number and type to match", () => {
    expect(() =>
      EmergencyContactSchema.parse({
        name: "Emergency",
        number: "112",
        type: "115",
      }),
    ).toThrow();
  });

  it("accepts a public-only SOS response", () => {
    expect(
      SosAcceptedSchema.parse({
        publicCode: "A3KX9M2P7Q4R",
        status: "RECEIVED",
        receivedAt: "2026-08-16T10:00:00.000Z",
        emergencyContacts: [{ name: "Emergency", number: "112", type: "112" }],
      }),
    ).toBeDefined();
  });

  it("validates anonymous citizen sessions without technical identity", () => {
    expect(
      CreateCitizenSessionSchema.parse({ device_class: "mobile" }),
    ).toEqual({ device_class: "mobile" });
    expect(
      CitizenSessionSchema.parse({
        session_id: uuid,
        session_token: "a".repeat(43),
        device_class: "mobile",
        created_at: "2026-08-16T10:00:00.000Z",
        expires_at: "2026-08-16T11:00:00.000Z",
        rotate_after: "2026-08-16T10:15:00.000Z",
      }),
    ).toBeDefined();
    expect(() =>
      CreateCitizenSessionSchema.parse({
        device_class: "mobile",
        ip_address: "127.0.0.1",
      }),
    ).toThrow();
  });
});
