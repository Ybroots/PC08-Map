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
