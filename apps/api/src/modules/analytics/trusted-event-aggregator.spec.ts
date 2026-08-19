import {
  DataClass,
  OfficerRole,
  createAccessScope,
  type AccessScope,
} from "@atgt/authorization";
import { EVENT_ROUTING_KEYS } from "@atgt/contracts";
import { METRIC_DEFINITIONS } from "./metric-definitions";
import {
  AnalyticsAggregationError,
  aggregateTrustedEvents,
  type MetricAggregationRequest,
} from "./trusted-event-aggregator";

const traceId = "0123456789abcdef0123456789abcdef";
const areaId = "synthetic-area";

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function leaderScope(areaIds: readonly string[] = [areaId]): AccessScope {
  return createAccessScope({
    principalId: "synthetic-leader",
    role: OfficerRole.LEADER_VIEWER,
    areaIds,
    maxDataClass: DataClass.INTERNAL,
  });
}

function request(
  metric: MetricAggregationRequest["metric"] = "INCIDENTS_RECEIVED",
): MetricAggregationRequest {
  return {
    metric,
    areaId,
    fromInclusive: "2026-08-19T00:00:00.000Z",
    toExclusive: "2026-08-21T00:00:00.000Z",
  };
}

function incidentEvent(
  index: number,
  occurredAt: string,
  overrides: Record<string, unknown> = {},
) {
  const incidentId = uuid(index + 100);
  return {
    event_id: uuid(index),
    type: EVENT_ROUTING_KEYS.INCIDENT_RECEIVED,
    version: 1,
    occurred_at: occurredAt,
    trace_id: traceId,
    aggregate_id: incidentId,
    aggregate_type: "incident",
    data: {
      incident_id: incidentId,
      incident_type: "TRAFFIC_ACCIDENT",
      priority: "HIGH",
      area_id: areaId,
      state: "RECEIVED",
    },
    ...overrides,
  };
}

function reportReceivedEvent(index: number) {
  const reportId = uuid(index + 200);
  return {
    event_id: uuid(index),
    type: EVENT_ROUTING_KEYS.REPORT_RECEIVED,
    version: 1,
    occurred_at: "2026-08-19T10:00:00.000Z",
    trace_id: traceId,
    aggregate_id: reportId,
    aggregate_type: "report",
    data: {
      report_id: reportId,
      category_code: "ROAD_HAZARD",
      area_id: areaId,
      state: "RECEIVED",
    },
  };
}

function reportScreenedEvent(index: number) {
  const reportId = uuid(index + 300);
  return {
    event_id: uuid(index),
    type: EVENT_ROUTING_KEYS.REPORT_SCREENING_COMPLETED,
    version: 1,
    occurred_at: "2026-08-19T11:00:00.000Z",
    trace_id: traceId,
    aggregate_id: reportId,
    aggregate_type: "report",
    data: {
      report_id: reportId,
      area_id: areaId,
      state: "PENDING_VERIFICATION",
      version: 2,
      mode: "MANUAL_REVIEW_ONLY",
    },
  };
}

function expectAnalyticsCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error("Expected analytics aggregation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(AnalyticsAggregationError);
    expect((error as AnalyticsAggregationError).code).toBe(code);
  }
}

describe("trusted event metric aggregation", () => {
  it("keeps every metric definition governed and target-free", () => {
    for (const definition of Object.values(METRIC_DEFINITIONS)) {
      expect(definition.unit).toBe("event");
      expect(definition.owner).toMatch(/^ATGT_/);
      expect(definition.sourceEvent).toMatch(/\.v1$/);
      expect(definition.governedTarget).toBe("GOVERNED_UNSET");
      expect(definition).not.toHaveProperty("target");
      expect(definition).not.toHaveProperty("baseline");
    }
  });

  it("reconciles unique incident events and deduplicates at-least-once replay", () => {
    const first = incidentEvent(1, "2026-08-19T10:00:00.000Z");
    const second = incidentEvent(2, "2026-08-19T12:00:00.000Z");
    const result = aggregateTrustedEvents(
      [first, first, second],
      leaderScope(),
      request(),
      { smallCellThreshold: 2 },
    );
    expect(result.rows).toEqual([
      {
        localDay: "2026-08-19",
        dimensions: {
          incident_type: "TRAFFIC_ACCIDENT",
          priority: "HIGH",
        },
        value: 2,
        suppressed: false,
      },
    ]);
    expect(result.dataFreshThrough).toBe("2026-08-19T12:00:00.000Z");
  });

  it("buckets the UTC day boundary in Asia/Ho_Chi_Minh", () => {
    const result = aggregateTrustedEvents(
      [
        incidentEvent(1, "2026-08-19T16:59:59.000Z"),
        incidentEvent(2, "2026-08-19T16:59:59.500Z"),
        incidentEvent(3, "2026-08-19T17:00:00.000Z"),
        incidentEvent(4, "2026-08-19T17:00:00.500Z"),
      ],
      leaderScope(),
      request(),
      { smallCellThreshold: 2 },
    );
    expect(result.timeZone).toBe("Asia/Ho_Chi_Minh");
    expect(result.rows.map((row) => [row.localDay, row.value])).toEqual([
      ["2026-08-19", 2],
      ["2026-08-20", 2],
    ]);
  });

  it("denies missing, wrong-role and cross-area scopes", () => {
    const rawEvents = [incidentEvent(1, "2026-08-19T10:00:00.000Z")];
    const dispatcher = createAccessScope({
      principalId: "synthetic-dispatcher",
      role: OfficerRole.DISPATCHER,
      areaIds: [areaId],
      maxDataClass: DataClass.INTERNAL,
    });
    for (const scope of [null, dispatcher, leaderScope(["different-area"])]) {
      expect(() =>
        aggregateTrustedEvents(rawEvents, scope, request(), {
          smallCellThreshold: 2,
        }),
      ).toThrow(AnalyticsAggregationError);
    }
  });

  it("suppresses small cells without returning identifiers or principals", () => {
    const source = incidentEvent(1, "2026-08-19T10:00:00.000Z");
    const result = aggregateTrustedEvents([source], leaderScope(), request(), {
      smallCellThreshold: 2,
    });
    expect(result.rows[0]).toMatchObject({ value: null, suppressed: true });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(source.event_id);
    expect(serialized).not.toContain(source.aggregate_id);
    expect(serialized).not.toContain("synthetic-leader");
  });

  it("fails closed on source drift, version drift and duplicate conflicts", () => {
    expectAnalyticsCode(
      () =>
        aggregateTrustedEvents(
          [reportReceivedEvent(1)],
          leaderScope(),
          request(),
          { smallCellThreshold: 2 },
        ),
      "INVALID_SOURCE_EVENT",
    );
    expectAnalyticsCode(
      () =>
        aggregateTrustedEvents(
          [{ ...reportReceivedEvent(1), version: 2 }],
          leaderScope(),
          request("REPORTS_RECEIVED"),
          { smallCellThreshold: 2 },
        ),
      "UNSUPPORTED_EVENT_VERSION",
    );
    const original = incidentEvent(1, "2026-08-19T10:00:00.000Z");
    const conflict = {
      ...original,
      data: { ...original.data, priority: "CRITICAL" },
    };
    expectAnalyticsCode(
      () =>
        aggregateTrustedEvents([original, conflict], leaderScope(), request(), {
          smallCellThreshold: 2,
        }),
      "DUPLICATE_EVENT_CONFLICT",
    );
  });

  it("requires an explicit valid suppression policy and UTC time range", () => {
    expectAnalyticsCode(
      () =>
        aggregateTrustedEvents(
          [],
          leaderScope(),
          { ...request(), metric: "UNKNOWN" as never },
          { smallCellThreshold: 2 },
        ),
      "INVALID_METRIC",
    );
    expectAnalyticsCode(
      () =>
        aggregateTrustedEvents([], leaderScope(), request(), {
          smallCellThreshold: 1,
        }),
      "SUPPRESSION_POLICY_REQUIRED",
    );
    expectAnalyticsCode(
      () =>
        aggregateTrustedEvents(
          [],
          leaderScope(),
          { ...request(), fromInclusive: "2026-08-19T00:00:00Z" },
          { smallCellThreshold: 2 },
        ),
      "INVALID_FROM_INSTANT",
    );
  });

  it.each([
    {
      metric: "REPORTS_RECEIVED" as const,
      events: [reportReceivedEvent(1), reportReceivedEvent(2)],
      dimensions: { category_code: "ROAD_HAZARD" },
    },
    {
      metric: "REPORTS_SCREENED" as const,
      events: [reportScreenedEvent(3), reportScreenedEvent(4)],
      dimensions: { mode: "MANUAL_REVIEW_ONLY" },
    },
  ])(
    "projects $metric from its exact event",
    ({ metric, events, dimensions }) => {
      const result = aggregateTrustedEvents(
        events,
        leaderScope(),
        request(metric),
        { smallCellThreshold: 2 },
      );
      expect(result.rows[0]).toMatchObject({ dimensions, value: 2 });
      expect(result.metric.sourceEvent).toBe(events[0]?.type);
    },
  );
});
