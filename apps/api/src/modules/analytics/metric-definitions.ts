import { EVENT_ROUTING_KEYS, type EventRoutingKey } from "@atgt/contracts";

export type MetricDefinition = Readonly<{
  name: string;
  unit: "event";
  sourceEvent: EventRoutingKey;
  dimensions: readonly string[];
  owner: string;
  dataClass: "internal";
  governedTarget: "GOVERNED_UNSET";
}>;

function metric(
  definition: Omit<MetricDefinition, "unit" | "dataClass" | "governedTarget">,
): MetricDefinition {
  return Object.freeze({
    ...definition,
    dimensions: Object.freeze([...definition.dimensions]),
    unit: "event",
    dataClass: "internal",
    governedTarget: "GOVERNED_UNSET",
  });
}

export const METRIC_DEFINITIONS = Object.freeze({
  INCIDENTS_RECEIVED: metric({
    name: "atgt_incidents_received_total",
    sourceEvent: EVENT_ROUTING_KEYS.INCIDENT_RECEIVED,
    dimensions: ["local_day", "incident_type", "priority"],
    owner: "ATGT_OPERATIONS_GOVERNANCE",
  }),
  REPORTS_RECEIVED: metric({
    name: "atgt_reports_received_total",
    sourceEvent: EVENT_ROUTING_KEYS.REPORT_RECEIVED,
    dimensions: ["local_day", "category_code"],
    owner: "ATGT_REPORT_GOVERNANCE",
  }),
  REPORTS_SCREENED: metric({
    name: "atgt_reports_screened_total",
    sourceEvent: EVENT_ROUTING_KEYS.REPORT_SCREENING_COMPLETED,
    dimensions: ["local_day", "mode"],
    owner: "ATGT_REPORT_GOVERNANCE",
  }),
});

export type MetricKey = keyof typeof METRIC_DEFINITIONS;

export function getMetricDefinition(metricKey: MetricKey): MetricDefinition {
  return METRIC_DEFINITIONS[metricKey];
}
