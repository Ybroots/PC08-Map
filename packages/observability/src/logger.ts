/**
 * StructuredLogger - Safe structured logging interface
 *
 * CRITICAL RULES (never violate):
 * 1. NEVER log: tokens, API keys, signed URLs, passwords, connection strings with creds
 * 2. NEVER log: citizen identity, PII, evidence file paths, case notes
 * 3. NEVER log: VietMap API keys or internal provider error details containing query data
 * 4. Only log fields in the ALLOWED_LOG_FIELDS allowlist
 * 5. All logs must include trace_id for correlation
 *
 * Full implementation (OTel SDK, structured JSON) added in T02.
 */
export interface StructuredLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
}

/**
 * Safe log fields - allowlist of fields that CAN be logged.
 * Any field not in this list must be redacted before logging.
 */
export interface LogContext {
  trace_id?: string;
  span_id?: string;
  /** Module name, e.g. "incidents", "dispatch" */
  module?: string;
  /** Operation name, e.g. "create_sos", "assign_unit" */
  operation?: string;
  /** Duration of operation in ms */
  duration_ms?: number;
  /** HTTP status code */
  status_code?: number;
  /** Incident/report public code (NOT internal ID unless needed for correlation) */
  public_code?: string;
  /** Provider name, e.g. "vietmap" */
  provider?: string;
  /** Provider API name */
  provider_api?: string;
  /** Provider response quality */
  provider_quality?: string;
  /** Whether operation used cache */
  cache_hit?: boolean;
  /** Error code (stable, from contracts) */
  error_code?: string;
  /** Additional safe fields */
  [key: string]: string | number | boolean | undefined;
}

/** Redacts sensitive values before logging */
export function redactSensitiveFields(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const SENSITIVE_PATTERNS = [
    /key/i,
    /secret/i,
    /token/i,
    /password/i,
    /credential/i,
    /signed.*url/i,
    /presigned/i,
    /authorization/i,
    /identity/i,
    /pii/i,
    /device_id/i,
    /ip_address/i,
  ];

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_PATTERNS.some((p) => p.test(k))) {
      result[k] = "[REDACTED]";
    } else {
      result[k] = v;
    }
  }
  return result;
}
