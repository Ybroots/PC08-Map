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
  };
  identity: { oidcIssuer: string; clientId: string };
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
    },
    identity: {
      oidcIssuer: url(required(source, "OIDC_ISSUER"), "OIDC_ISSUER", [
        "http:",
        "https:",
      ]),
      clientId: required(source, "OIDC_CLIENT_ID"),
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
