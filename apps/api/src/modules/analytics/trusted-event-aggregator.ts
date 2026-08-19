import {
  AuthorizationPolicy,
  DataClass,
  PolicyAction,
  requireAccessScope,
  type AccessScope,
} from "@atgt/authorization";
import {
  IncidentReceivedEventSchema,
  ReportReceivedEventSchema,
  ReportScreeningCompletedEventSchema,
  type EventEnvelope,
} from "@atgt/contracts";
import {
  METRIC_DEFINITIONS,
  getMetricDefinition,
  type MetricDefinition,
  type MetricKey,
} from "./metric-definitions";

const LOCAL_TIME_ZONE = "Asia/Ho_Chi_Minh" as const;
const localDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: LOCAL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type MetricAggregationRequest = Readonly<{
  metric: MetricKey;
  areaId: string;
  fromInclusive: string;
  toExclusive: string;
}>;

export type MetricAggregationOptions = Readonly<{
  smallCellThreshold: number;
}>;

export type MetricAggregationRow = Readonly<{
  localDay: string;
  dimensions: Readonly<Record<string, string>>;
  value: number | null;
  suppressed: boolean;
}>;

export type MetricAggregationResult = Readonly<{
  metric: MetricDefinition;
  areaId: string;
  fromInclusive: string;
  toExclusive: string;
  timeZone: typeof LOCAL_TIME_ZONE;
  dataFreshThrough: string | null;
  rows: readonly MetricAggregationRow[];
}>;

export class AnalyticsAggregationError extends Error {
  constructor(readonly code: string) {
    super(`Analytics aggregation failed: ${code}`);
    this.name = "AnalyticsAggregationError";
  }
}

type ProjectedEvent = Readonly<{
  event: EventEnvelope;
  areaId: string;
  dimensions: Readonly<Record<string, string>>;
}>;

function parseUtcInstant(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new AnalyticsAggregationError(code);
  }
  return parsed;
}

function localDay(instant: string): string {
  const parts = Object.fromEntries(
    localDateFormatter
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function projectEvent(metric: MetricKey, rawEvent: unknown): ProjectedEvent {
  try {
    if (metric === "INCIDENTS_RECEIVED") {
      const event = IncidentReceivedEventSchema.parse(rawEvent);
      return {
        event,
        areaId: event.data.area_id,
        dimensions: {
          incident_type: event.data.incident_type,
          priority: event.data.priority,
        },
      };
    }
    if (metric === "REPORTS_RECEIVED") {
      const event = ReportReceivedEventSchema.parse(rawEvent);
      if (
        event.aggregate_type !== "report" ||
        event.aggregate_id !== event.data.report_id
      ) {
        throw new Error("invalid report aggregate");
      }
      return {
        event,
        areaId: event.data.area_id,
        dimensions: { category_code: event.data.category_code },
      };
    }
    const event = ReportScreeningCompletedEventSchema.parse(rawEvent);
    if (
      event.aggregate_type !== "report" ||
      event.aggregate_id !== event.data.report_id
    ) {
      throw new Error("invalid report aggregate");
    }
    return {
      event,
      areaId: event.data.area_id,
      dimensions: { mode: event.data.mode },
    };
  } catch {
    throw new AnalyticsAggregationError("INVALID_SOURCE_EVENT");
  }
}

function authorize(
  scope: AccessScope | null | undefined,
  areaId: string,
): void {
  let resolved: AccessScope;
  try {
    resolved = requireAccessScope(scope);
  } catch {
    throw new AnalyticsAggregationError("SCOPE_DENIED");
  }
  const result = new AuthorizationPolicy().evaluate(resolved, {
    action: PolicyAction.ANALYTICS_READ,
    resource: { dataClass: DataClass.INTERNAL, areaId },
  });
  if (!result.allowed) {
    throw new AnalyticsAggregationError(`SCOPE_DENIED_${result.reason}`);
  }
}

export function aggregateTrustedEvents(
  rawEvents: readonly unknown[],
  scope: AccessScope | null | undefined,
  request: MetricAggregationRequest,
  options: MetricAggregationOptions,
): MetricAggregationResult {
  if (!Object.hasOwn(METRIC_DEFINITIONS, request.metric)) {
    throw new AnalyticsAggregationError("INVALID_METRIC");
  }
  if (
    !request.areaId ||
    request.areaId.length > 100 ||
    request.areaId !== request.areaId.trim()
  ) {
    throw new AnalyticsAggregationError("INVALID_AREA");
  }
  const from = parseUtcInstant(request.fromInclusive, "INVALID_FROM_INSTANT");
  const to = parseUtcInstant(request.toExclusive, "INVALID_TO_INSTANT");
  if (from >= to) throw new AnalyticsAggregationError("INVALID_TIME_RANGE");
  if (
    !Number.isSafeInteger(options.smallCellThreshold) ||
    options.smallCellThreshold < 2
  ) {
    throw new AnalyticsAggregationError("SUPPRESSION_POLICY_REQUIRED");
  }
  authorize(scope, request.areaId);

  const definition = getMetricDefinition(request.metric);
  const eventFingerprints = new Map<string, string>();
  const groups = new Map<
    string,
    { localDay: string; dimensions: Record<string, string>; count: number }
  >();
  let dataFreshThrough: string | null = null;

  for (const rawEvent of rawEvents) {
    const projected = projectEvent(request.metric, rawEvent);
    if (projected.areaId !== request.areaId) continue;
    if (projected.event.version !== 1) {
      throw new AnalyticsAggregationError("UNSUPPORTED_EVENT_VERSION");
    }
    const fingerprint = JSON.stringify(projected.event);
    const existing = eventFingerprints.get(projected.event.event_id);
    if (existing !== undefined) {
      if (existing !== fingerprint) {
        throw new AnalyticsAggregationError("DUPLICATE_EVENT_CONFLICT");
      }
      continue;
    }
    eventFingerprints.set(projected.event.event_id, fingerprint);

    const occurredAt = Date.parse(projected.event.occurred_at);
    if (occurredAt < from || occurredAt >= to) continue;
    if (
      dataFreshThrough === null ||
      occurredAt > Date.parse(dataFreshThrough)
    ) {
      dataFreshThrough = projected.event.occurred_at;
    }
    const day = localDay(projected.event.occurred_at);
    const dimensionEntries = Object.entries(projected.dimensions).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    const key = JSON.stringify([day, dimensionEntries]);
    const current = groups.get(key);
    if (current) {
      current.count += 1;
    } else {
      groups.set(key, {
        localDay: day,
        dimensions: Object.fromEntries(dimensionEntries),
        count: 1,
      });
    }
  }

  const rows = [...groups.values()]
    .sort((left, right) => {
      const dateOrder = left.localDay.localeCompare(right.localDay);
      return (
        dateOrder ||
        JSON.stringify(left.dimensions).localeCompare(
          JSON.stringify(right.dimensions),
        )
      );
    })
    .map((group) => {
      const suppressed = group.count < options.smallCellThreshold;
      return Object.freeze({
        localDay: group.localDay,
        dimensions: Object.freeze({ ...group.dimensions }),
        value: suppressed ? null : group.count,
        suppressed,
      });
    });

  return Object.freeze({
    metric: definition,
    areaId: request.areaId,
    fromInclusive: request.fromInclusive,
    toExclusive: request.toExclusive,
    timeZone: LOCAL_TIME_ZONE,
    dataFreshThrough,
    rows: Object.freeze(rows),
  });
}
