import {
  CitizenReportAcceptedSchema,
  CreateCitizenReportSchema,
  CreateSosSchema,
  CreateCitizenSessionSchema,
  CitizenSessionSchema,
  ERROR_CODES,
  EVENT_ROUTING_KEYS,
  EmergencyContactSchema,
  EventEnvelopeSchema,
  EvidenceReadyEventSchema,
  EvidenceFinalizeHeadersSchema,
  EvidenceAccessGrantSchema,
  EvidenceInitiateHeadersSchema,
  EvidenceScanRequestedEventSchema,
  EvidenceUploadInitiatedSchema,
  FinalizeEvidenceUploadSchema,
  InitiateEvidenceUploadSchema,
  MapFeatureCollectionInputSchema,
  PublicMapQuerySchema,
  PublicReportTrackingSchema,
  ProblemDetailsSchema,
  ProviderQuality,
  ProviderQualitySchema,
  SosAcceptedSchema,
  SosIdempotencyHeadersSchema,
  IncidentReceivedEventDataSchema,
  OpsIncidentFeedQuerySchema,
  OpsReportVerificationDecisionSchema,
  OpsReportVerificationQueueQuerySchema,
  DuplicateFalsePositiveRequestSchema,
  ReportReceivedEventDataSchema,
  ReportEvidenceLinkHeadersSchema,
  ReportEvidenceLinkedSchema,
  ReportEvidenceLinkedEventDataSchema,
  ReportVerificationDecidedEventDataSchema,
  ReportDuplicateFalsePositiveEventDataSchema,
} from "./index";

const traceId = "0123456789abcdef0123456789abcdef";
const uuid = "550e8400-e29b-41d4-a716-446655440000";

describe("executable contracts", () => {
  it("requires explicit, versioned operator duplicate decisions", () => {
    expect(
      OpsReportVerificationQueueQuerySchema.parse({ after: "12", limit: "25" }),
    ).toEqual({ after: "12", limit: 25 });
    expect(
      OpsReportVerificationDecisionSchema.safeParse({
        decision: "DUPLICATE",
        expectedVersion: 3,
        reason: "Operator confirmed the suggested match",
      }).success,
    ).toBe(false);
    expect(
      OpsReportVerificationDecisionSchema.parse({
        decision: "DUPLICATE",
        expectedVersion: 3,
        reason: "Operator confirmed the suggested match",
        duplicateCandidateId: uuid,
        duplicateCandidateExpectedVersion: 1,
      }),
    ).toMatchObject({ decision: "DUPLICATE", expectedVersion: 3 });
    expect(
      DuplicateFalsePositiveRequestSchema.safeParse({
        expectedVersion: 1,
        reason: "",
      }).success,
    ).toBe(false);
    expect(
      ReportVerificationDecidedEventDataSchema.parse({
        report_id: uuid,
        area_id: "area-dalat",
        state: "DUPLICATE",
        version: 4,
      }),
    ).toEqual({
      report_id: uuid,
      area_id: "area-dalat",
      state: "DUPLICATE",
      version: 4,
    });
    expect(
      ReportDuplicateFalsePositiveEventDataSchema.safeParse({
        report_id: uuid,
        candidate_id: "75f84ae8-bf67-41d6-a25e-e5b601b3ba71",
        area_id: "area-dalat",
        candidate_version: 2,
        reason: "must not leave the transaction boundary",
      }).success,
    ).toBe(false);
  });

  it("accepts a PII-free citizen report with explicitly unverified plate text", () => {
    const payload = {
      categoryCode: "TRAFFIC_VIOLATION",
      coordinateLongitude: 108.4384,
      coordinateLatitude: 11.9404,
      description: "Synthetic citizen report fixture",
      plateTextUnverified: "49A-000.00",
      clientReportedAt: "2026-08-19T10:00:00.000Z",
    };
    expect(CreateCitizenReportSchema.parse(payload)).toEqual(payload);
    expect(
      CreateCitizenReportSchema.safeParse({
        ...payload,
        deviceId: "forbidden-identity",
      }).success,
    ).toBe(false);
  });

  it("keeps report acknowledgement, tracking and event projections minimal", () => {
    expect(
      CitizenReportAcceptedSchema.parse({
        publicCode: "A3KX9M2P7Q4R",
        status: "RECEIVED",
        receivedAt: "2026-08-19T10:00:00.000Z",
      }),
    ).not.toHaveProperty("reportId");
    expect(
      PublicReportTrackingSchema.parse({
        publicCode: "A3KX9M2P7Q4R",
        status: "IN_PROGRESS",
        receivedAt: "2026-08-19T10:00:00.000Z",
        lastUpdatedAt: "2026-08-19T10:05:00.000Z",
      }),
    ).not.toHaveProperty("plateTextUnverified");
    const event = ReportReceivedEventDataSchema.parse({
      report_id: uuid,
      category_code: "TRAFFIC_VIOLATION",
      area_id: "synthetic-area",
      state: "RECEIVED",
    });
    expect(event).not.toHaveProperty("public_code");
    expect(event).not.toHaveProperty("longitude");
    expect(event).not.toHaveProperty("plate_text_unverified");
  });

  it("keeps report evidence linking capability-protected and privacy-safe", () => {
    expect(
      ReportEvidenceLinkHeadersSchema.parse({
        "x-report-capability": "r".repeat(43),
        "x-upload-capability": "u".repeat(43),
        "x-citizen-session": "s".repeat(43),
      }),
    ).toBeDefined();
    expect(
      ReportEvidenceLinkedSchema.parse({ evidenceId: uuid, state: "ATTACHED" }),
    ).toEqual({ evidenceId: uuid, state: "ATTACHED" });
    const event = ReportEvidenceLinkedEventDataSchema.parse({
      report_id: uuid,
      evidence_id: "650e8400-e29b-41d4-a716-446655440000",
      area_id: "synthetic-area",
    });
    expect(JSON.stringify(event)).not.toMatch(
      /public_code|object_key|sha256|capability|session|plate|description/,
    );
  });

  it("accepts a valid SOS request and strips no unknown data", () => {
    const payload = {
      coordinateLongitude: 108.4384,
      coordinateLatitude: 11.9404,
      accuracyMeters: 12.5,
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
    { incidentType: "traffic accident" },
    { description: "x".repeat(501) },
  ])("rejects an invalid SOS boundary: %o", (override) => {
    expect(() =>
      CreateSosSchema.parse({
        coordinateLongitude: 108.4384,
        coordinateLatitude: 11.9404,
        accuracyMeters: 12.5,
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
        incidentType: "TRAFFIC_ACCIDENT",
        clientEventAt: "2026-08-16T10:00:00.000Z",
        citizenIdentity: "must-not-enter-incident-contract",
      }),
    ).toThrow();
  });

  it("keeps idempotency in the transport header, not the SOS body", () => {
    expect(
      SosIdempotencyHeadersSchema.parse({ "idempotency-key": uuid }),
    ).toEqual({ "idempotency-key": uuid });
    expect(() =>
      SosIdempotencyHeadersSchema.parse({
        "idempotency-key": "predictable-key",
      }),
    ).toThrow();
    expect(() =>
      CreateSosSchema.parse({
        coordinateLongitude: 108.4384,
        coordinateLatitude: 11.9404,
        accuracyMeters: 12.5,
        incidentType: "TRAFFIC_ACCIDENT",
        clientEventAt: "2026-08-16T10:00:00.000Z",
        idempotencyKey: uuid,
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

  it("keeps the incident received event free of public codes and coordinates", () => {
    const data = IncidentReceivedEventDataSchema.parse({
      incident_id: uuid,
      incident_type: "TRAFFIC_ACCIDENT",
      priority: "CRITICAL",
      area_id: "lam-dong",
      state: "RECEIVED",
    });
    expect(data).not.toHaveProperty("public_code");
    expect(data).not.toHaveProperty("coordinate");
  });

  it("normalizes a bounded resume cursor query", () => {
    expect(
      OpsIncidentFeedQuerySchema.parse({ after: "42", limit: "25" }),
    ).toEqual({ after: "42", limit: 25 });
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

  it("keeps evidence upload contracts executable and storage-key free", () => {
    const request = InitiateEvidenceUploadSchema.parse({
      declared_mime: "image/jpeg",
      declared_size_bytes: 4096,
      declared_sha256: "a".repeat(64),
    });
    expect(request.declared_size_bytes).toBe(4096);
    const initiated = EvidenceUploadInitiatedSchema.parse({
      upload_id: uuid,
      upload_url: "https://upload.example.test/capability",
      upload_method: "PUT",
      upload_capability: "c".repeat(43),
      expires_at: "2026-08-16T10:05:00.000Z",
    });
    expect(initiated).not.toHaveProperty("object_key");
    expect(
      FinalizeEvidenceUploadSchema.parse({ observed_sha256: "a".repeat(64) }),
    ).toBeDefined();
    expect(
      EvidenceInitiateHeadersSchema.parse({
        "idempotency-key": uuid,
        "x-citizen-session": "s".repeat(43),
      }),
    ).toBeDefined();
    expect(
      EvidenceFinalizeHeadersSchema.parse({
        "x-upload-capability": "c".repeat(43),
        "x-citizen-session": "s".repeat(43),
      }),
    ).toBeDefined();
    expect(() =>
      EvidenceInitiateHeadersSchema.parse({ "idempotency-key": uuid }),
    ).toThrow();
  });

  it("returns a bounded evidence access grant without storage keys", () => {
    const grant = EvidenceAccessGrantSchema.parse({
      evidence_id: uuid,
      access_kind: "PREVIEW",
      media_type: "image/png",
      access_url: "https://storage.example.test/signed-preview",
      expires_at: "2026-08-16T10:02:00.000Z",
    });
    expect(grant.access_kind).toBe("PREVIEW");
    expect(JSON.stringify(grant)).not.toMatch(/object_key|sha256|scan_engine/);
    expect(() =>
      EvidenceAccessGrantSchema.parse({
        ...grant,
        original_object_key: "original/secret",
      }),
    ).toThrow();
  });

  it("keeps evidence events free of object keys, URLs and checksums", () => {
    const base = {
      event_id: uuid,
      version: 1,
      occurred_at: "2026-08-16T10:00:00.000Z",
      trace_id: traceId,
      aggregate_id: uuid,
      aggregate_type: "evidence",
    };
    const requested = EvidenceScanRequestedEventSchema.parse({
      ...base,
      type: EVENT_ROUTING_KEYS.EVIDENCE_SCAN_REQUESTED,
      data: { evidence_id: uuid, state: "SCAN_PENDING" },
    });
    const ready = EvidenceReadyEventSchema.parse({
      ...base,
      type: EVENT_ROUTING_KEYS.EVIDENCE_READY,
      data: {
        evidence_id: uuid,
        state: "READY",
        mime: "image/jpeg",
        size_bytes: 4096,
      },
    });
    for (const event of [requested, ready]) {
      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain("object_key");
      expect(serialized).not.toContain("upload_url");
      expect(serialized).not.toContain("sha256");
    }
  });

  it("accepts ordered EPSG:4326 map input and normalizes bbox query values", () => {
    expect(
      MapFeatureCollectionInputSchema.parse({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "dp-dalat-01",
            geometry: { type: "Point", coordinates: [108.4384, 11.9404] },
            properties: { severity: "HIGH" },
          },
        ],
      }).features[0]?.geometry,
    ).toMatchObject({ type: "Point" });
    expect(
      PublicMapQuerySchema.parse({
        bbox: "108.40,11.90,108.50,11.98",
        zoom: "13",
      }),
    ).toEqual({ bbox: [108.4, 11.9, 108.5, 11.98], zoom: 13 });
  });

  it("rejects an open polygon ring and an inverted bbox", () => {
    expect(() =>
      MapFeatureCollectionInputSchema.parse({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "open-ring",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [108.4, 11.9],
                  [108.5, 11.9],
                  [108.5, 12],
                  [108.4, 12],
                ],
              ],
            },
            properties: {},
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      PublicMapQuerySchema.parse({
        bbox: "108.50,11.90,108.40,11.98",
        zoom: 13,
      }),
    ).toThrow();
  });
});
