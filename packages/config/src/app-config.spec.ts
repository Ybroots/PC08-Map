import { loadAndValidateConfig } from "./app-config";

const validEnvironment = (): Record<string, string> => ({
  APP_ENV: "development",
  APP_VERSION: "test",
  LOG_LEVEL: "debug",
  PORT: "3000",
  DATABASE_URL: "postgresql://app:secret@localhost:5432/atgt",
  AUDIT_DATABASE_URL: "postgresql://audit:secret@localhost:5432/atgt",
  PRIVACY_DATABASE_URL: "postgresql://privacy:secret@localhost:5432/atgt",
  RABBITMQ_ENDPOINTS: "amqp://localhost:5672",
  RABBITMQ_VHOST: "/",
  REDIS_SENTINELS: "redis-a:26379,redis-b:26380",
  REDIS_MASTER_NAME: "mymaster",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET_QUARANTINE: "quarantine",
  S3_BUCKET_ORIGINAL: "original",
  S3_BUCKET_DERIVATIVE: "derivative",
  OIDC_ISSUER: "http://localhost:8080/realms/atgt",
  OIDC_CLIENT_ID: "atgt-api",
  OIDC_AUDIENCE: "atgt-api",
  OIDC_JWKS_URI: "http://localhost:8080/realms/atgt/certs",
  OIDC_JWKS_CACHE_TTL_MS: "600000",
  OIDC_USE_MOCK: "false",
  CITIZEN_SESSION_TTL_MINUTES: "60",
  CITIZEN_SESSION_ROTATE_AFTER_MINUTES: "15",
  VIETMAP_BASE_URL: "https://maps.vietmap.vn",
  VIETMAP_SERVER_KEY_REF: "secret:vietmap/key",
  VIETMAP_CLIENT_KEY_ALIAS: "vietmap-client",
  VIETMAP_TIMEOUT_MS: "5000",
  VIETMAP_QUOTA_WARNING_PCT: "70",
  VIETMAP_USE_FAKE_ADAPTER: "true",
  PRIVACY_GRANT_TTL_HOURS: "24",
  PRIVACY_POLICY_VERSION: "PENDING",
  RETENTION_POLICY_VERSION: "PENDING",
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4317",
  OTEL_SERVICE_NAME: "atgt-api",
});

describe("loadAndValidateConfig", () => {
  it("parses a complete environment", () => {
    const config = loadAndValidateConfig(validEnvironment());
    expect(config.app.port).toBe(3000);
    expect(config.redis.sentinels).toHaveLength(2);
    expect(config.vietmap.useFakeAdapter).toBe(true);
    expect(config.identity.useMock).toBe(false);
  });

  it("fails when an isolated database URL is missing", () => {
    const environment = validEnvironment();
    delete environment.PRIVACY_DATABASE_URL;
    expect(() => loadAndValidateConfig(environment)).toThrow(
      "PRIVACY_DATABASE_URL is required",
    );
  });

  it("rejects debug logging in production", () => {
    expect(() =>
      loadAndValidateConfig({ ...validEnvironment(), APP_ENV: "production" }),
    ).toThrow("LOG_LEVEL=debug is not allowed in production");
  });

  it("rejects mock identity outside development and test", () => {
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        APP_ENV: "staging",
        LOG_LEVEL: "info",
        OIDC_ISSUER: "https://identity.example.test/realms/atgt",
        OIDC_JWKS_URI: "https://identity.example.test/realms/atgt/certs",
        OIDC_USE_MOCK: "true",
      }),
    ).toThrow("OIDC_USE_MOCK is allowed only in development or test");
  });

  it("requires all local mock identity fields without echoing its token", () => {
    const secret = "local-token-that-must-not-be-echoed";
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        OIDC_USE_MOCK: "true",
        OIDC_MOCK_TOKEN: secret,
      }),
    ).toThrow("OIDC_MOCK_SUBJECT is required");
    try {
      loadAndValidateConfig({
        ...validEnvironment(),
        OIDC_USE_MOCK: "true",
        OIDC_MOCK_TOKEN: secret,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it("requires session rotation before expiry", () => {
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        CITIZEN_SESSION_TTL_MINUTES: "15",
        CITIZEN_SESSION_ROTATE_AFTER_MINUTES: "15",
      }),
    ).toThrow(
      "CITIZEN_SESSION_ROTATE_AFTER_MINUTES must be less than CITIZEN_SESSION_TTL_MINUTES",
    );
  });

  it("fails closed when citizen session policy is absent", () => {
    const environment = validEnvironment();
    delete environment.CITIZEN_SESSION_TTL_MINUTES;
    expect(() => loadAndValidateConfig(environment)).toThrow(
      "CITIZEN_SESSION_TTL_MINUTES is required",
    );
  });

  it("keeps privacy disabled while policy is pending", () => {
    const config = loadAndValidateConfig({
      ...validEnvironment(),
      VAULT_KEY_REF: "secret:privacy/key",
    });
    expect(config.privacy.featureEnabled).toBe(false);
  });

  it("requires a vault key reference after policy approval", () => {
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        PRIVACY_POLICY_VERSION: "2026-01",
      }),
    ).toThrow("VAULT_KEY_REF is required when privacy policy is approved");
  });

  it("rejects retention auto-delete before D-06 approval", () => {
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        RETENTION_AUTO_DELETE_ENABLED: "true",
      }),
    ).toThrow(
      "RETENTION_AUTO_DELETE_ENABLED cannot be enabled before D-06 approval",
    );
  });

  it("keeps the map lifecycle scheduler fail-closed", () => {
    expect(loadAndValidateConfig(validEnvironment()).mapLifecycle.enabled).toBe(
      false,
    );
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        MAP_LIFECYCLE_WORKER_ENABLED: "true",
      }),
    ).toThrow("MAP_LIFECYCLE_POLL_MS is required");
    expect(
      loadAndValidateConfig({
        ...validEnvironment(),
        MAP_LIFECYCLE_WORKER_ENABLED: "true",
        MAP_LIFECYCLE_POLL_MS: "5000",
      }).mapLifecycle.pollMs,
    ).toBe(5000);
  });

  it("keeps SOS intake fail-closed until its deployment policy is explicit", () => {
    expect(loadAndValidateConfig(validEnvironment()).sosIntake.enabled).toBe(
      false,
    );
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        SOS_INGEST_ENABLED: "true",
      }),
    ).toThrow("SOS_INTAKE_AREA_ID is required");
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        SOS_INGEST_ENABLED: "true",
        SOS_INTAKE_AREA_ID: "lam-dong",
      }),
    ).toThrow("SOS_IDEMPOTENCY_TTL_MINUTES is required");
    expect(
      loadAndValidateConfig({
        ...validEnvironment(),
        SOS_INGEST_ENABLED: "true",
        SOS_INTAKE_AREA_ID: "lam-dong",
        SOS_IDEMPOTENCY_TTL_MINUTES: "60",
      }).sosIntake,
    ).toEqual({
      enabled: true,
      intakeAreaId: "lam-dong",
      idempotencyTtlMinutes: 60,
    });
  });

  it("requires explicit outbox relay poll and batch values when enabled", () => {
    expect(loadAndValidateConfig(validEnvironment()).outboxRelay.enabled).toBe(
      false,
    );
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        OUTBOX_RELAY_ENABLED: "true",
      }),
    ).toThrow("OUTBOX_RELAY_POLL_MS is required");
    expect(
      loadAndValidateConfig({
        ...validEnvironment(),
        OUTBOX_RELAY_ENABLED: "true",
        OUTBOX_RELAY_POLL_MS: "1000",
        OUTBOX_RELAY_BATCH_SIZE: "25",
      }).outboxRelay,
    ).toEqual({ enabled: true, pollMs: 1000, batchSize: 25 });
  });

  it("keeps citizen report intake local/test and fail-closed", () => {
    expect(loadAndValidateConfig(validEnvironment()).reportIntake).toEqual({
      enabled: false,
      intakeAreaId: undefined,
      idempotencyTtlMinutes: undefined,
      evidenceLinkingEnabled: false,
      capabilitySecret: undefined,
    });
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        REPORT_INTAKE_ENABLED: "true",
      }),
    ).toThrow("REPORT_INTAKE_AREA_ID is required");
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        REPORT_INTAKE_ENABLED: "true",
        REPORT_INTAKE_AREA_ID: "lam-dong",
      }),
    ).toThrow("REPORT_IDEMPOTENCY_TTL_MINUTES is required");
    expect(
      loadAndValidateConfig({
        ...validEnvironment(),
        REPORT_INTAKE_ENABLED: "true",
        REPORT_INTAKE_AREA_ID: "lam-dong",
        REPORT_IDEMPOTENCY_TTL_MINUTES: "60",
      }).reportIntake,
    ).toEqual({
      enabled: true,
      intakeAreaId: "lam-dong",
      idempotencyTtlMinutes: 60,
      evidenceLinkingEnabled: false,
      capabilitySecret: undefined,
    });
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        APP_ENV: "production",
        LOG_LEVEL: "info",
        OIDC_ISSUER: "https://identity.example.test/realms/atgt",
        OIDC_JWKS_URI: "https://identity.example.test/realms/atgt/certs",
        REPORT_INTAKE_ENABLED: "true",
      }),
    ).toThrow(
      "REPORT_INTAKE_ENABLED is blocked outside local/test until T11B production gates complete",
    );
  });

  it("requires explicit local evidence and isolated capability policy for report linking", () => {
    const base = {
      ...validEnvironment(),
      REPORT_INTAKE_ENABLED: "true",
      REPORT_INTAKE_AREA_ID: "lam-dong",
      REPORT_IDEMPOTENCY_TTL_MINUTES: "60",
      REPORT_EVIDENCE_LINKING_ENABLED: "true",
      REPORT_CAPABILITY_SECRET: "report-capability-secret-32-characters",
    };
    expect(() => loadAndValidateConfig(base)).toThrow(
      "REPORT_EVIDENCE_LINKING_ENABLED requires EVIDENCE_PIPELINE_ENABLED",
    );
    const enabled = loadAndValidateConfig({
      ...base,
      EVIDENCE_PIPELINE_ENABLED: "true",
      EVIDENCE_ALLOWED_MIME_TYPES: "image/jpeg",
      EVIDENCE_MAX_BYTES: "1048576",
      EVIDENCE_UPLOAD_URL_TTL_SECONDS: "300",
      EVIDENCE_READ_URL_TTL_SECONDS: "120",
      EVIDENCE_WORKER_POLL_MS: "1000",
      EVIDENCE_WORKER_BATCH_SIZE: "10",
      EVIDENCE_CAPABILITY_SECRET: "evidence-capability-secret-32-characters",
      EVIDENCE_USE_FAKE_ANTIVIRUS: "true",
      S3_REGION: "us-east-1",
      S3_ACCESS_KEY: "local-access",
      S3_SECRET_KEY: "local-secret",
      S3_FORCE_PATH_STYLE: "true",
    });
    expect(enabled.reportIntake).toMatchObject({
      evidenceLinkingEnabled: true,
      capabilitySecret: "report-capability-secret-32-characters",
    });
  });

  it("keeps report screening local/test and requires every scheduler bound", () => {
    expect(loadAndValidateConfig(validEnvironment()).reportScreening).toEqual({
      enabled: false,
      pollMs: undefined,
      batchSize: undefined,
      maxCandidatesPerReport: undefined,
    });
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        REPORT_SCREENING_WORKER_ENABLED: "true",
      }),
    ).toThrow("REPORT_SCREENING_POLL_MS is required");
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        REPORT_SCREENING_WORKER_ENABLED: "true",
        REPORT_SCREENING_POLL_MS: "1000",
        REPORT_SCREENING_BATCH_SIZE: "10",
      }),
    ).toThrow("REPORT_SCREENING_MAX_CANDIDATES_PER_REPORT is required");
    expect(
      loadAndValidateConfig({
        ...validEnvironment(),
        REPORT_SCREENING_WORKER_ENABLED: "true",
        REPORT_SCREENING_POLL_MS: "1000",
        REPORT_SCREENING_BATCH_SIZE: "10",
        REPORT_SCREENING_MAX_CANDIDATES_PER_REPORT: "5",
      }).reportScreening,
    ).toEqual({
      enabled: true,
      pollMs: 1000,
      batchSize: 10,
      maxCandidatesPerReport: 5,
    });
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        APP_ENV: "production",
        LOG_LEVEL: "info",
        OIDC_ISSUER: "https://identity.example.test/realms/atgt",
        OIDC_JWKS_URI: "https://identity.example.test/realms/atgt/certs",
        REPORT_SCREENING_WORKER_ENABLED: "true",
      }),
    ).toThrow(
      "REPORT_SCREENING_WORKER_ENABLED is local/test only until D-09 screening policy approval",
    );
  });

  it("keeps the evidence pipeline disabled without implicit media policy", () => {
    expect(loadAndValidateConfig(validEnvironment()).evidence).toEqual({
      enabled: false,
      allowedMimeTypes: [],
      maxBytes: undefined,
      uploadUrlTtlSeconds: undefined,
      readUrlTtlSeconds: undefined,
      workerPollMs: undefined,
      workerBatchSize: undefined,
      useFakeAntivirus: false,
      capabilitySecret: undefined,
    });
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        EVIDENCE_PIPELINE_ENABLED: "true",
      }),
    ).toThrow("EVIDENCE_ALLOWED_MIME_TYPES is required");
  });

  it("requires every evidence deployment parameter when enabled", () => {
    const enabled = {
      ...validEnvironment(),
      EVIDENCE_PIPELINE_ENABLED: "true",
      EVIDENCE_ALLOWED_MIME_TYPES: "image/jpeg,image/png",
      EVIDENCE_MAX_BYTES: "1048576",
      EVIDENCE_UPLOAD_URL_TTL_SECONDS: "300",
      EVIDENCE_READ_URL_TTL_SECONDS: "120",
      EVIDENCE_WORKER_POLL_MS: "1000",
      EVIDENCE_WORKER_BATCH_SIZE: "10",
      EVIDENCE_USE_FAKE_ANTIVIRUS: "true",
      EVIDENCE_CAPABILITY_SECRET: "local-test-capability-secret-32-characters",
      S3_REGION: "us-east-1",
      S3_ACCESS_KEY: "local-test-access-key",
      S3_SECRET_KEY: "local-test-secret-key",
      S3_FORCE_PATH_STYLE: "true",
    };
    expect(loadAndValidateConfig(enabled).evidence).toEqual({
      enabled: true,
      allowedMimeTypes: ["image/jpeg", "image/png"],
      maxBytes: 1048576,
      uploadUrlTtlSeconds: 300,
      readUrlTtlSeconds: 120,
      workerPollMs: 1000,
      workerBatchSize: 10,
      useFakeAntivirus: true,
      capabilitySecret: "local-test-capability-secret-32-characters",
    });
    expect(() =>
      loadAndValidateConfig({ ...enabled, EVIDENCE_MAX_BYTES: "" }),
    ).toThrow("EVIDENCE_MAX_BYTES is required");
    expect(() =>
      loadAndValidateConfig({
        ...enabled,
        EVIDENCE_READ_URL_TTL_SECONDS: "",
      }),
    ).toThrow("EVIDENCE_READ_URL_TTL_SECONDS is required");
    expect(() =>
      loadAndValidateConfig({
        ...enabled,
        EVIDENCE_ALLOWED_MIME_TYPES: "image/jpeg,video/mp4",
      }),
    ).toThrow(
      "EVIDENCE_ALLOWED_MIME_TYPES contains a media type unsupported by the T10B2 derivative worker",
    );
    expect(() =>
      loadAndValidateConfig({
        ...enabled,
        EVIDENCE_USE_FAKE_ANTIVIRUS: "false",
      }),
    ).toThrow(
      "EVIDENCE_USE_FAKE_ANTIVIRUS must be true for the local/test evidence pipeline",
    );
    expect(() =>
      loadAndValidateConfig({
        ...enabled,
        EVIDENCE_CAPABILITY_SECRET: "too-short",
      }),
    ).toThrow("EVIDENCE_CAPABILITY_SECRET must be at least 32 characters");
  });

  it("rejects fake antivirus outside development and test", () => {
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        APP_ENV: "production",
        LOG_LEVEL: "info",
        OIDC_ISSUER: "https://identity.example.test/realms/atgt",
        OIDC_JWKS_URI: "https://identity.example.test/realms/atgt/certs",
        EVIDENCE_USE_FAKE_ANTIVIRUS: "true",
      }),
    ).toThrow(
      "EVIDENCE_USE_FAKE_ANTIVIRUS is allowed only in development or test",
    );
    expect(() =>
      loadAndValidateConfig({
        ...validEnvironment(),
        APP_ENV: "staging",
        LOG_LEVEL: "info",
        OIDC_ISSUER: "https://identity.example.test/realms/atgt",
        OIDC_JWKS_URI: "https://identity.example.test/realms/atgt/certs",
        EVIDENCE_PIPELINE_ENABLED: "true",
      }),
    ).toThrow(
      "EVIDENCE_PIPELINE_ENABLED is blocked outside local/test until T10B provider approval",
    );
  });

  it("does not include a secret value in URL validation errors", () => {
    const secret = "super-secret-password";
    let message = "";
    try {
      loadAndValidateConfig({ ...validEnvironment(), DATABASE_URL: secret });
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain("DATABASE_URL must be a valid URL");
    expect(message).not.toContain(secret);
  });
});
