/**
 * Typed runtime configuration shared by API and workers.
 *
 * Configuration is parsed once, before application bootstrap. Required values
 * never fall back to another credential or endpoint: an invalid deployment
 * must stop instead of starting with reduced isolation.
 */
export interface AppConfig {
  app: {
    env: "development" | "test" | "staging" | "production";
    version: string;
    logLevel: "debug" | "info" | "warn" | "error";
    port: number;
  };
  database: { url: string; auditUrl: string; privacyUrl: string };
  queue: { endpoints: string[]; vhost: string };
  redis: { sentinels: { host: string; port: number }[]; masterName: string };
  storage: {
    endpoint: string;
    bucketQuarantine: string;
    bucketOriginal: string;
    bucketDerivative: string;
    region?: string;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle: boolean;
  };
  identity: {
    oidcIssuer: string;
    clientId: string;
    audience: string;
    jwksUri?: string;
    jwksCacheTtlMs: number;
    useMock: boolean;
    mock?: {
      token: string;
      subject: string;
      role: string;
      unitIds: readonly string[];
      areaIds: readonly string[];
      assignedCaseIds: readonly string[];
      maxDataClass: string;
      authenticationMethods: readonly string[];
      sessionId: string;
    };
  };
  citizenSession: { ttlMinutes: number; rotateAfterMinutes: number };
  vietmap: {
    baseUrl: string;
    serverKeyRef: string;
    clientKeyAlias: string;
    timeoutMs: number;
    quotaWarningPct: number;
    useFakeAdapter: boolean;
  };
  privacy: {
    vaultKeyRef?: string;
    grantTtlHours: number;
    policyVersion: string;
    featureEnabled: boolean;
  };
  retention: { policyVersion: string; autoDeleteEnabled: false };
  mapLifecycle: { enabled: boolean; pollMs?: number };
  sosIntake: {
    enabled: boolean;
    intakeAreaId?: string;
    idempotencyTtlMinutes?: number;
  };
  reportIntake: {
    enabled: boolean;
    intakeAreaId?: string;
    idempotencyTtlMinutes?: number;
    evidenceLinkingEnabled: boolean;
    capabilitySecret?: string;
  };
  outboxRelay: { enabled: boolean; pollMs?: number; batchSize?: number };
  evidence: {
    enabled: boolean;
    allowedMimeTypes: readonly string[];
    maxBytes?: number;
    uploadUrlTtlSeconds?: number;
    readUrlTtlSeconds?: number;
    workerPollMs?: number;
    workerBatchSize?: number;
    useFakeAntivirus: boolean;
    capabilitySecret?: string;
  };
  telemetry: { otlpEndpoint: string; serviceName: string };
}

type Environment =
  NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;

const APP_ENVIRONMENTS = [
  "development",
  "test",
  "staging",
  "production",
] as const;
const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
const OFFICER_ROLES = [
  "dispatcher",
  "field_officer",
  "data_editor",
  "data_approver",
  "leader_viewer",
  "security_auditor",
  "privacy_approver",
  "system_admin",
] as const;
const DATA_CLASSES = ["public", "internal", "sensitive", "restricted"] as const;

function required(source: Environment, name: string): string {
  const value = source[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function oneOf<const T extends readonly string[]>(
  value: string,
  name: string,
  choices: T,
): T[number] {
  if (!choices.includes(value)) {
    throw new Error(`${name} must be one of: ${choices.join(", ")}`);
  }
  return value as T[number];
}

function integer(
  source: Environment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = source[name]?.trim() ?? String(fallback);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function boolean(
  source: Environment,
  name: string,
  fallback: boolean,
): boolean {
  const raw = source[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function url(
  value: string,
  name: string,
  protocols: readonly string[],
): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${name} must use ${protocols.join(" or ")}`);
  }
  return value;
}

function list(source: Environment, name: string): string[] {
  const values = required(source, name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0)
    throw new Error(`${name} must contain at least one value`);
  return values;
}

function optionalList(source: Environment, name: string): string[] {
  return (source[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function redisSentinels(source: Environment): { host: string; port: number }[] {
  return list(source, "REDIS_SENTINELS").map((sentinel) => {
    const separator = sentinel.lastIndexOf(":");
    const host = sentinel.slice(0, separator).trim();
    const portRaw = sentinel.slice(separator + 1).trim();
    if (separator < 1 || !/^\d+$/.test(portRaw)) {
      throw new Error("REDIS_SENTINELS must use host:port entries");
    }
    const port = Number(portRaw);
    if (port < 1 || port > 65535) {
      throw new Error("REDIS_SENTINELS contains an invalid port");
    }
    return { host, port };
  });
}

/** Parse and validate all runtime configuration. Throws without exposing values. */
export function loadAndValidateConfig(
  source: Environment = process.env,
): AppConfig {
  const env = oneOf(required(source, "APP_ENV"), "APP_ENV", APP_ENVIRONMENTS);
  const logLevel = oneOf(
    source["LOG_LEVEL"]?.trim() ?? "info",
    "LOG_LEVEL",
    LOG_LEVELS,
  );
  if (env === "production" && logLevel === "debug") {
    throw new Error("LOG_LEVEL=debug is not allowed in production");
  }

  const queueEndpoints = list(source, "RABBITMQ_ENDPOINTS").map((endpoint) =>
    url(endpoint, "RABBITMQ_ENDPOINTS", ["amqp:", "amqps:"]),
  );
  const policyVersion = source["PRIVACY_POLICY_VERSION"]?.trim() || "PENDING";
  const vaultKeyRef = source["VAULT_KEY_REF"]?.trim() || undefined;
  const privacyApproved = policyVersion !== "PENDING";
  if (privacyApproved && !vaultKeyRef) {
    throw new Error(
      "VAULT_KEY_REF is required when privacy policy is approved",
    );
  }
  if (boolean(source, "RETENTION_AUTO_DELETE_ENABLED", false)) {
    throw new Error(
      "RETENTION_AUTO_DELETE_ENABLED cannot be enabled before D-06 approval",
    );
  }
  const mapLifecycleEnabled = boolean(
    source,
    "MAP_LIFECYCLE_WORKER_ENABLED",
    false,
  );
  if (mapLifecycleEnabled) required(source, "MAP_LIFECYCLE_POLL_MS");
  const mapLifecyclePollMs = source["MAP_LIFECYCLE_POLL_MS"]?.trim()
    ? integer(source, "MAP_LIFECYCLE_POLL_MS", 0, 1000, 3_600_000)
    : undefined;
  const sosIntakeEnabled = boolean(source, "SOS_INGEST_ENABLED", false);
  const sosIntakeAreaId = sosIntakeEnabled
    ? required(source, "SOS_INTAKE_AREA_ID")
    : undefined;
  if (sosIntakeAreaId && !/^[a-z0-9][a-z0-9-]{1,99}$/.test(sosIntakeAreaId)) {
    throw new Error("SOS_INTAKE_AREA_ID has an invalid format");
  }
  if (sosIntakeEnabled) required(source, "SOS_IDEMPOTENCY_TTL_MINUTES");
  const sosIdempotencyTtlMinutes = source["SOS_IDEMPOTENCY_TTL_MINUTES"]?.trim()
    ? integer(source, "SOS_IDEMPOTENCY_TTL_MINUTES", 0, 1, 525_600)
    : undefined;
  const reportIntakeEnabled = boolean(source, "REPORT_INTAKE_ENABLED", false);
  if (reportIntakeEnabled && (env === "staging" || env === "production")) {
    throw new Error(
      "REPORT_INTAKE_ENABLED is blocked outside local/test until T11B production gates complete",
    );
  }
  const reportIntakeAreaId = reportIntakeEnabled
    ? required(source, "REPORT_INTAKE_AREA_ID")
    : undefined;
  if (
    reportIntakeAreaId &&
    !/^[a-z0-9][a-z0-9-]{1,99}$/.test(reportIntakeAreaId)
  ) {
    throw new Error("REPORT_INTAKE_AREA_ID has an invalid format");
  }
  if (reportIntakeEnabled) {
    required(source, "REPORT_IDEMPOTENCY_TTL_MINUTES");
  }
  const reportIdempotencyTtlMinutes = source[
    "REPORT_IDEMPOTENCY_TTL_MINUTES"
  ]?.trim()
    ? integer(source, "REPORT_IDEMPOTENCY_TTL_MINUTES", 0, 1, 525_600)
    : undefined;
  const reportEvidenceLinkingEnabled = boolean(
    source,
    "REPORT_EVIDENCE_LINKING_ENABLED",
    false,
  );
  if (reportEvidenceLinkingEnabled && !reportIntakeEnabled) {
    throw new Error(
      "REPORT_EVIDENCE_LINKING_ENABLED requires REPORT_INTAKE_ENABLED",
    );
  }
  if (
    reportEvidenceLinkingEnabled &&
    (env === "staging" || env === "production")
  ) {
    throw new Error(
      "REPORT_EVIDENCE_LINKING_ENABLED is blocked outside local/test until T11B production gates complete",
    );
  }
  const reportCapabilitySecret = reportEvidenceLinkingEnabled
    ? required(source, "REPORT_CAPABILITY_SECRET")
    : undefined;
  if (
    reportCapabilitySecret !== undefined &&
    reportCapabilitySecret.length < 32
  ) {
    throw new Error("REPORT_CAPABILITY_SECRET must be at least 32 characters");
  }
  const outboxRelayEnabled = boolean(source, "OUTBOX_RELAY_ENABLED", false);
  if (outboxRelayEnabled) {
    required(source, "OUTBOX_RELAY_POLL_MS");
    required(source, "OUTBOX_RELAY_BATCH_SIZE");
  }
  const outboxRelayPollMs = source["OUTBOX_RELAY_POLL_MS"]?.trim()
    ? integer(source, "OUTBOX_RELAY_POLL_MS", 0, 100, 3_600_000)
    : undefined;
  const outboxRelayBatchSize = source["OUTBOX_RELAY_BATCH_SIZE"]?.trim()
    ? integer(source, "OUTBOX_RELAY_BATCH_SIZE", 0, 1, 1000)
    : undefined;
  const evidenceEnabled = boolean(source, "EVIDENCE_PIPELINE_ENABLED", false);
  if (reportEvidenceLinkingEnabled && !evidenceEnabled) {
    throw new Error(
      "REPORT_EVIDENCE_LINKING_ENABLED requires EVIDENCE_PIPELINE_ENABLED",
    );
  }
  const useFakeAntivirus = boolean(
    source,
    "EVIDENCE_USE_FAKE_ANTIVIRUS",
    false,
  );
  if (useFakeAntivirus && (env === "staging" || env === "production")) {
    throw new Error(
      "EVIDENCE_USE_FAKE_ANTIVIRUS is allowed only in development or test",
    );
  }
  if (evidenceEnabled && (env === "staging" || env === "production")) {
    throw new Error(
      "EVIDENCE_PIPELINE_ENABLED is blocked outside local/test until T10B provider approval",
    );
  }
  if (evidenceEnabled) {
    for (const name of [
      "EVIDENCE_ALLOWED_MIME_TYPES",
      "EVIDENCE_MAX_BYTES",
      "EVIDENCE_UPLOAD_URL_TTL_SECONDS",
      "EVIDENCE_READ_URL_TTL_SECONDS",
      "EVIDENCE_WORKER_POLL_MS",
      "EVIDENCE_WORKER_BATCH_SIZE",
      "EVIDENCE_CAPABILITY_SECRET",
      "S3_REGION",
      "S3_ACCESS_KEY",
      "S3_SECRET_KEY",
      "S3_FORCE_PATH_STYLE",
    ]) {
      required(source, name);
    }
    if (!useFakeAntivirus) {
      throw new Error(
        "EVIDENCE_USE_FAKE_ANTIVIRUS must be true for the local/test evidence pipeline",
      );
    }
  }
  const evidenceCapabilitySecret = source["EVIDENCE_CAPABILITY_SECRET"]?.trim();
  if (
    evidenceCapabilitySecret !== undefined &&
    evidenceCapabilitySecret.length < 32
  ) {
    throw new Error(
      "EVIDENCE_CAPABILITY_SECRET must be at least 32 characters",
    );
  }
  const storageRegion = source["S3_REGION"]?.trim() || undefined;
  const storageAccessKey = source["S3_ACCESS_KEY"]?.trim() || undefined;
  const storageSecretKey = source["S3_SECRET_KEY"]?.trim() || undefined;
  const storageForcePathStyle = boolean(source, "S3_FORCE_PATH_STYLE", false);
  const evidenceAllowedMimeTypes = evidenceEnabled
    ? list(source, "EVIDENCE_ALLOWED_MIME_TYPES")
    : optionalList(source, "EVIDENCE_ALLOWED_MIME_TYPES");
  if (
    evidenceAllowedMimeTypes.some(
      (mime) =>
        mime !== mime.toLowerCase() ||
        !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mime),
    )
  ) {
    throw new Error(
      "EVIDENCE_ALLOWED_MIME_TYPES contains an invalid MIME type",
    );
  }
  if (
    evidenceEnabled &&
    evidenceAllowedMimeTypes.some(
      (mime) => mime !== "image/jpeg" && mime !== "image/png",
    )
  ) {
    throw new Error(
      "EVIDENCE_ALLOWED_MIME_TYPES contains a media type unsupported by the T10B2 derivative worker",
    );
  }
  const evidenceMaxBytes = source["EVIDENCE_MAX_BYTES"]?.trim()
    ? integer(source, "EVIDENCE_MAX_BYTES", 0, 1, Number.MAX_SAFE_INTEGER)
    : undefined;
  const evidenceUploadUrlTtlSeconds = source[
    "EVIDENCE_UPLOAD_URL_TTL_SECONDS"
  ]?.trim()
    ? integer(source, "EVIDENCE_UPLOAD_URL_TTL_SECONDS", 0, 1, 604_800)
    : undefined;
  const evidenceReadUrlTtlSeconds = source[
    "EVIDENCE_READ_URL_TTL_SECONDS"
  ]?.trim()
    ? integer(source, "EVIDENCE_READ_URL_TTL_SECONDS", 0, 1, 3_600)
    : undefined;
  const evidenceWorkerPollMs = source["EVIDENCE_WORKER_POLL_MS"]?.trim()
    ? integer(source, "EVIDENCE_WORKER_POLL_MS", 0, 1, Number.MAX_SAFE_INTEGER)
    : undefined;
  const evidenceWorkerBatchSize = source["EVIDENCE_WORKER_BATCH_SIZE"]?.trim()
    ? integer(
        source,
        "EVIDENCE_WORKER_BATCH_SIZE",
        0,
        1,
        Number.MAX_SAFE_INTEGER,
      )
    : undefined;

  const oidcIssuer = url(
    required(source, "OIDC_ISSUER"),
    "OIDC_ISSUER",
    env === "production" || env === "staging"
      ? ["https:"]
      : ["http:", "https:"],
  );
  const useMockIdentity = boolean(source, "OIDC_USE_MOCK", false);
  if (useMockIdentity && env !== "development" && env !== "test") {
    throw new Error("OIDC_USE_MOCK is allowed only in development or test");
  }
  const jwksUriRaw = source["OIDC_JWKS_URI"]?.trim();
  const jwksUri = useMockIdentity
    ? undefined
    : url(
        required(source, "OIDC_JWKS_URI"),
        "OIDC_JWKS_URI",
        env === "production" || env === "staging"
          ? ["https:"]
          : ["http:", "https:"],
      );
  const mockIdentity = useMockIdentity
    ? {
        token: required(source, "OIDC_MOCK_TOKEN"),
        subject: required(source, "OIDC_MOCK_SUBJECT"),
        role: oneOf(
          required(source, "OIDC_MOCK_ROLE"),
          "OIDC_MOCK_ROLE",
          OFFICER_ROLES,
        ),
        unitIds: optionalList(source, "OIDC_MOCK_UNIT_IDS"),
        areaIds: optionalList(source, "OIDC_MOCK_AREA_IDS"),
        assignedCaseIds: optionalList(source, "OIDC_MOCK_CASE_IDS"),
        maxDataClass: oneOf(
          required(source, "OIDC_MOCK_MAX_DATA_CLASS"),
          "OIDC_MOCK_MAX_DATA_CLASS",
          DATA_CLASSES,
        ),
        authenticationMethods: optionalList(
          source,
          "OIDC_MOCK_AUTHENTICATION_METHODS",
        ),
        sessionId: required(source, "OIDC_MOCK_SESSION_ID"),
      }
    : undefined;
  required(source, "CITIZEN_SESSION_TTL_MINUTES");
  const citizenSessionTtlMinutes = integer(
    source,
    "CITIZEN_SESSION_TTL_MINUTES",
    60,
    5,
    1440,
  );
  required(source, "CITIZEN_SESSION_ROTATE_AFTER_MINUTES");
  const citizenSessionRotateAfterMinutes = integer(
    source,
    "CITIZEN_SESSION_ROTATE_AFTER_MINUTES",
    15,
    1,
    1439,
  );
  if (citizenSessionRotateAfterMinutes >= citizenSessionTtlMinutes) {
    throw new Error(
      "CITIZEN_SESSION_ROTATE_AFTER_MINUTES must be less than CITIZEN_SESSION_TTL_MINUTES",
    );
  }

  return {
    app: {
      env,
      version: source["APP_VERSION"]?.trim() || "0.0.0",
      logLevel,
      port: integer(source, "PORT", 3000, 1, 65535),
    },
    database: {
      url: url(required(source, "DATABASE_URL"), "DATABASE_URL", [
        "postgres:",
        "postgresql:",
      ]),
      auditUrl: url(
        required(source, "AUDIT_DATABASE_URL"),
        "AUDIT_DATABASE_URL",
        ["postgres:", "postgresql:"],
      ),
      privacyUrl: url(
        required(source, "PRIVACY_DATABASE_URL"),
        "PRIVACY_DATABASE_URL",
        ["postgres:", "postgresql:"],
      ),
    },
    queue: {
      endpoints: queueEndpoints,
      vhost: required(source, "RABBITMQ_VHOST"),
    },
    redis: {
      sentinels: redisSentinels(source),
      masterName: required(source, "REDIS_MASTER_NAME"),
    },
    storage: {
      endpoint: url(required(source, "S3_ENDPOINT"), "S3_ENDPOINT", [
        "http:",
        "https:",
      ]),
      bucketQuarantine: required(source, "S3_BUCKET_QUARANTINE"),
      bucketOriginal: required(source, "S3_BUCKET_ORIGINAL"),
      bucketDerivative: required(source, "S3_BUCKET_DERIVATIVE"),
      region: storageRegion,
      accessKey: storageAccessKey,
      secretKey: storageSecretKey,
      forcePathStyle: storageForcePathStyle,
    },
    identity: {
      oidcIssuer,
      clientId: required(source, "OIDC_CLIENT_ID"),
      audience: required(source, "OIDC_AUDIENCE"),
      jwksUri: jwksUriRaw ? jwksUri : undefined,
      jwksCacheTtlMs: integer(
        source,
        "OIDC_JWKS_CACHE_TTL_MS",
        600_000,
        30_000,
        3_600_000,
      ),
      useMock: useMockIdentity,
      mock: mockIdentity,
    },
    citizenSession: {
      ttlMinutes: citizenSessionTtlMinutes,
      rotateAfterMinutes: citizenSessionRotateAfterMinutes,
    },
    vietmap: {
      baseUrl: url(required(source, "VIETMAP_BASE_URL"), "VIETMAP_BASE_URL", [
        "https:",
      ]),
      serverKeyRef: required(source, "VIETMAP_SERVER_KEY_REF"),
      clientKeyAlias: required(source, "VIETMAP_CLIENT_KEY_ALIAS"),
      timeoutMs: integer(source, "VIETMAP_TIMEOUT_MS", 5000, 100, 60_000),
      quotaWarningPct: integer(source, "VIETMAP_QUOTA_WARNING_PCT", 70, 1, 100),
      useFakeAdapter: boolean(source, "VIETMAP_USE_FAKE_ADAPTER", false),
    },
    privacy: {
      vaultKeyRef,
      grantTtlHours: integer(source, "PRIVACY_GRANT_TTL_HOURS", 24, 1, 168),
      policyVersion,
      featureEnabled: privacyApproved && vaultKeyRef !== undefined,
    },
    retention: {
      policyVersion: source["RETENTION_POLICY_VERSION"]?.trim() || "PENDING",
      autoDeleteEnabled: false,
    },
    mapLifecycle: {
      enabled: mapLifecycleEnabled,
      pollMs: mapLifecyclePollMs,
    },
    sosIntake: {
      enabled: sosIntakeEnabled,
      intakeAreaId: sosIntakeAreaId,
      idempotencyTtlMinutes: sosIdempotencyTtlMinutes,
    },
    reportIntake: {
      enabled: reportIntakeEnabled,
      intakeAreaId: reportIntakeAreaId,
      idempotencyTtlMinutes: reportIdempotencyTtlMinutes,
      evidenceLinkingEnabled: reportEvidenceLinkingEnabled,
      capabilitySecret: reportCapabilitySecret,
    },
    outboxRelay: {
      enabled: outboxRelayEnabled,
      pollMs: outboxRelayPollMs,
      batchSize: outboxRelayBatchSize,
    },
    evidence: {
      enabled: evidenceEnabled,
      allowedMimeTypes: evidenceAllowedMimeTypes,
      maxBytes: evidenceMaxBytes,
      uploadUrlTtlSeconds: evidenceUploadUrlTtlSeconds,
      readUrlTtlSeconds: evidenceReadUrlTtlSeconds,
      workerPollMs: evidenceWorkerPollMs,
      workerBatchSize: evidenceWorkerBatchSize,
      useFakeAntivirus,
      capabilitySecret: evidenceCapabilitySecret,
    },
    telemetry: {
      otlpEndpoint: url(
        required(source, "OTEL_EXPORTER_OTLP_ENDPOINT"),
        "OTEL_EXPORTER_OTLP_ENDPOINT",
        ["http:", "https:"],
      ),
      serviceName: required(source, "OTEL_SERVICE_NAME"),
    },
  };
}
