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
