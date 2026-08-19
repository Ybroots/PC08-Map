import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { NestFactory } from "@nestjs/core";
import { loadAndValidateConfig } from "@atgt/config";
import { Pool } from "pg";
import { AppModule } from "../src/app.module";
import { hashUploadCapability } from "../src/modules/evidence/evidence-capability";

const SKIP = process.env["SKIP_SMOKE"] === "true";
const ADMIN_DATABASE_URL =
  process.env["ADMIN_DATABASE_URL"] ??
  "postgresql://postgres:devpassword_local@localhost:5432/atgt_dev";
const areaId = `test-t11-http-${randomUUID()}`;

const config = loadAndValidateConfig({
  APP_ENV: "test",
  APP_VERSION: "t11-http-integration",
  LOG_LEVEL: "error",
  PORT: "3000",
  DATABASE_URL:
    process.env["DATABASE_URL"] ??
    "postgresql://atgt_app:devpassword_local@localhost:5432/atgt_dev",
  AUDIT_DATABASE_URL:
    "postgresql://atgt_audit:devpassword_local@localhost:5432/atgt_dev",
  PRIVACY_DATABASE_URL:
    "postgresql://atgt_privacy:devpassword_local@localhost:5432/atgt_dev",
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
  VIETMAP_USE_FAKE_ADAPTER: "true",
  REPORT_INTAKE_ENABLED: "true",
  REPORT_INTAKE_AREA_ID: areaId,
  REPORT_IDEMPOTENCY_TTL_MINUTES: "60",
  REPORT_EVIDENCE_LINKING_ENABLED: "true",
  REPORT_CAPABILITY_SECRET: "http-report-capability-secret-32-characters",
  EVIDENCE_PIPELINE_ENABLED: "true",
  EVIDENCE_ALLOWED_MIME_TYPES: "image/jpeg",
  EVIDENCE_MAX_BYTES: "1048576",
  EVIDENCE_UPLOAD_URL_TTL_SECONDS: "300",
  EVIDENCE_READ_URL_TTL_SECONDS: "120",
  EVIDENCE_WORKER_POLL_MS: "1000",
  EVIDENCE_WORKER_BATCH_SIZE: "10",
  EVIDENCE_CAPABILITY_SECRET: "http-evidence-capability-secret-32-characters",
  EVIDENCE_USE_FAKE_ANTIVIRUS: "true",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY: "minio_dev",
  S3_SECRET_KEY: "devpassword_local",
  S3_FORCE_PATH_STYLE: "true",
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4317",
  OTEL_SERVICE_NAME: "atgt-api-t11-http-integration",
});

describe("T11A citizen report HTTP boundary", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let admin: Pool;
  let baseUrl: string;
  const idempotencyKeys: string[] = [];
  const sessionIds: string[] = [];
  const evidenceIds: string[] = [];

  beforeAll(async () => {
    if (SKIP) return;
    admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    app = await NestFactory.create(AppModule.register(config), {
      logger: false,
    });
    app.setGlobalPrefix("api/v1");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  afterAll(async () => {
    if (SKIP) return;
    const ids = await admin.query<{ id: string }>(
      "SELECT id FROM report.reports WHERE area_id=$1",
      [areaId],
    );
    const reportIds = ids.rows.map((row) => row.id);
    if (evidenceIds.length > 0) {
      await admin.query(
        "DELETE FROM evidence.objects WHERE evidence_id=ANY($1::uuid[])",
        [evidenceIds],
      );
      await admin.query(
        "DELETE FROM evidence.uploads WHERE upload_id=ANY($1::uuid[])",
        [evidenceIds],
      );
    }
    if (reportIds.length > 0) {
      await admin.query(
        "DELETE FROM platform.outbox WHERE aggregate_id=ANY($1::text[])",
        [reportIds],
      );
      await admin.query(
        "DELETE FROM audit.audit_events WHERE object_id=ANY($1::text[])",
        [reportIds],
      );
      await admin.query(
        "DELETE FROM report.status_history WHERE report_id=ANY($1::uuid[])",
        [reportIds],
      );
      await admin.query("DELETE FROM report.reports WHERE id=ANY($1::uuid[])", [
        reportIds,
      ]);
    }
    if (idempotencyKeys.length > 0) {
      await admin.query(
        "DELETE FROM platform.idempotency_keys WHERE idempotency_key=ANY($1::text[])",
        [idempotencyKeys.map((key) => `report:${key}`)],
      );
    }
    if (sessionIds.length > 0) {
      await admin.query(
        "DELETE FROM identity.citizen_sessions WHERE session_id=ANY($1::uuid[])",
        [sessionIds],
      );
    }
    await app.close();
    await admin.end();
  });

  const reportBody = {
    categoryCode: "TRAFFIC_VIOLATION",
    coordinateLongitude: 108.4384,
    coordinateLatitude: 11.9404,
    description: "Synthetic HTTP citizen report fixture",
    plateTextUnverified: "49A-000.00",
    clientReportedAt: "2026-08-19T06:00:00.000Z",
  };

  it("denies report submission without an anonymous citizen session", async () => {
    if (SKIP) return;
    const response = await fetch(`${baseUrl}/public/reports`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify(reportBody),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error_code: "ATGT_CITIZEN_SESSION_INVALID",
    });
  });

  it("creates a session, accepts/replays once and tracks only general status", async () => {
    if (SKIP) return;
    const sessionResponse = await fetch(`${baseUrl}/public/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_class: "web" }),
    });
    expect(sessionResponse.status).toBe(201);
    const session = (await sessionResponse.json()) as {
      session_id: string;
      session_token: string;
    };
    sessionIds.push(session.session_id);

    const key = randomUUID();
    idempotencyKeys.push(key);
    const submit = () =>
      fetch(`${baseUrl}/public/reports`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
          "x-citizen-session": session.session_token,
        },
        body: JSON.stringify(reportBody),
      });
    const first = await submit();
    expect(first.status).toBe(202);
    expect(first.headers.get("idempotency-replayed")).toBe("false");
    const accepted = (await first.json()) as {
      publicCode: string;
      status: string;
      receivedAt: string;
      reportCapability: string;
    };

    const replay = await submit();
    expect(replay.status).toBe(202);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(await replay.json()).toEqual(accepted);

    const tracking = await fetch(
      `${baseUrl}/public/reports/${accepted.publicCode}`,
    );
    expect(tracking.status).toBe(200);
    expect(await tracking.json()).toEqual({
      publicCode: accepted.publicCode,
      status: "RECEIVED",
      receivedAt: accepted.receivedAt,
      lastUpdatedAt: accepted.receivedAt,
    });

    const evidenceId = randomUUID();
    evidenceIds.push(evidenceId);
    const uploadCapability = "http-upload-capability-ready-evidence-t11b1";
    const sha256 = "b".repeat(64);
    await admin.query(
      `INSERT INTO evidence.uploads
         (upload_id,capability_hash,quarantine_object_key,declared_sha256,
          declared_mime,declared_size_bytes,state,observed_sha256,created_at,
          expires_at,finalized_at,processed_at)
       VALUES ($1,$2,$3,$4,'image/jpeg',128,'READY',$4,NOW(),
               NOW()+INTERVAL '1 hour',NOW(),NOW())`,
      [
        evidenceId,
        hashUploadCapability(uploadCapability),
        `quarantine/${evidenceId}`,
        sha256,
      ],
    );
    await admin.query(
      `INSERT INTO evidence.objects
         (evidence_id,original_object_key,derivative_object_key,sha256,mime,
          size_bytes,scan_engine,scan_engine_version)
       VALUES ($1,$2,$3,$4,'image/jpeg',128,'test-av','1')`,
      [
        evidenceId,
        `original/${evidenceId}`,
        `derivative/${evidenceId}`,
        sha256,
      ],
    );
    const attachmentUrl = `${baseUrl}/public/reports/${accepted.publicCode}/evidence/${evidenceId}`;
    const missingSession = await fetch(attachmentUrl, {
      method: "POST",
      headers: {
        "x-report-capability": accepted.reportCapability,
        "x-upload-capability": uploadCapability,
      },
    });
    expect(missingSession.status).toBe(401);
    const attached = await fetch(attachmentUrl, {
      method: "POST",
      headers: {
        "x-citizen-session": session.session_token,
        "x-report-capability": accepted.reportCapability,
        "x-upload-capability": uploadCapability,
      },
    });
    expect(attached.status).toBe(200);
    expect(await attached.json()).toEqual({ evidenceId, state: "ATTACHED" });
  });
});
