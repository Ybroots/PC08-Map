export class IncidentMetrics {
  private accepted = 0;
  private replayed = 0;
  private failed = 0;
  private durationCount = 0;
  private durationSumMs = 0;

  recordAccepted(durationMs: number, replayed: boolean): void {
    this.accepted += replayed ? 0 : 1;
    this.replayed += replayed ? 1 : 0;
    this.durationCount += 1;
    this.durationSumMs += durationMs;
  }

  recordFailure(durationMs: number): void {
    this.failed += 1;
    this.durationCount += 1;
    this.durationSumMs += durationMs;
  }

  renderPrometheus(): string {
    return [
      "# HELP atgt_sos_intake_accepted_total Newly accepted SOS incidents.",
      "# TYPE atgt_sos_intake_accepted_total counter",
      `atgt_sos_intake_accepted_total ${this.accepted}`,
      "# HELP atgt_sos_intake_replayed_total Idempotent SOS response replays.",
      "# TYPE atgt_sos_intake_replayed_total counter",
      `atgt_sos_intake_replayed_total ${this.replayed}`,
      "# HELP atgt_sos_intake_failures_total SOS intake failures.",
      "# TYPE atgt_sos_intake_failures_total counter",
      `atgt_sos_intake_failures_total ${this.failed}`,
      "# HELP atgt_sos_intake_duration_ms SOS acknowledgement duration without sensitive labels.",
      "# TYPE atgt_sos_intake_duration_ms summary",
      `atgt_sos_intake_duration_ms_count ${this.durationCount}`,
      `atgt_sos_intake_duration_ms_sum ${this.durationSumMs.toFixed(3)}`,
      "",
    ].join("\n");
  }
}
