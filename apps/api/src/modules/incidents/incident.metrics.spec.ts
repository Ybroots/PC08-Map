import { IncidentMetrics } from "./incident.metrics";

describe("incident intake metrics", () => {
  it("records aggregate outcomes without sensitive labels", () => {
    const metrics = new IncidentMetrics();
    metrics.recordAccepted(12.5, false);
    metrics.recordAccepted(4.5, true);
    metrics.recordFailure(3);
    const output = metrics.renderPrometheus();
    expect(output).toContain("atgt_sos_intake_accepted_total 1");
    expect(output).toContain("atgt_sos_intake_replayed_total 1");
    expect(output).toContain("atgt_sos_intake_failures_total 1");
    expect(output).toContain("atgt_sos_intake_duration_ms_count 3");
    expect(output).not.toContain("public_code");
    expect(output).not.toContain("incident_id");
  });
});
