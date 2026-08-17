import { Test } from "@nestjs/testing";
import { loadAndValidateConfig } from "@atgt/config";
import { AppModule } from "./app.module";
import { EvidenceService } from "./modules/evidence/evidence.service";

const config = loadAndValidateConfig({
  APP_ENV: "test",
  DATABASE_URL: "postgresql://app:local@localhost:5432/atgt_dev",
  AUDIT_DATABASE_URL: "postgresql://audit:local@localhost:5432/atgt_dev",
  PRIVACY_DATABASE_URL: "postgresql://privacy:local@localhost:5432/atgt_dev",
  RABBITMQ_ENDPOINTS: "amqp://localhost:5672",
  RABBITMQ_VHOST: "/",
  REDIS_SENTINELS: "localhost:26379",
  REDIS_MASTER_NAME: "mymaster",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET_QUARANTINE: "atgt-quarantine",
  S3_BUCKET_ORIGINAL: "atgt-evidence-original",
  S3_BUCKET_DERIVATIVE: "atgt-evidence-derivative",
  OIDC_ISSUER: "https://identity.example.test/realms/atgt",
  OIDC_CLIENT_ID: "atgt-api",
  OIDC_AUDIENCE: "atgt-api",
  OIDC_JWKS_URI: "https://identity.example.test/realms/atgt/certs",
  CITIZEN_SESSION_TTL_MINUTES: "60",
  CITIZEN_SESSION_ROTATE_AFTER_MINUTES: "15",
  VIETMAP_BASE_URL: "https://maps.vietmap.vn",
  VIETMAP_SERVER_KEY_REF: "secret:vietmap/server-key",
  VIETMAP_CLIENT_KEY_ALIAS: "local-test",
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4317",
  OTEL_SERVICE_NAME: "atgt-api-test",
});

describe("AppModule", () => {
  it("boots with the evidence runtime safely disabled", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    }).compile();
    expect(moduleRef.get(EvidenceService)).toBeInstanceOf(EvidenceService);
    await moduleRef.close();
  });
});
