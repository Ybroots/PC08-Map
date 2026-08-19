import type { EvidenceAccessKind } from "./evidence-access.types";

export class EvidenceAccessMetrics {
  private previewIssued = 0;
  private downloadIssued = 0;
  private denied = 0;
  private failed = 0;

  recordIssued(kind: EvidenceAccessKind): void {
    if (kind === "PREVIEW") this.previewIssued += 1;
    else this.downloadIssued += 1;
  }

  recordDenied(): void {
    this.denied += 1;
  }

  recordFailure(): void {
    this.failed += 1;
  }

  renderPrometheus(): string {
    return [
      "# HELP atgt_evidence_preview_grants_total Scoped derivative grants issued.",
      "# TYPE atgt_evidence_preview_grants_total counter",
      `atgt_evidence_preview_grants_total ${this.previewIssued}`,
      "# HELP atgt_evidence_download_grants_total Scoped original grants issued.",
      "# TYPE atgt_evidence_download_grants_total counter",
      `atgt_evidence_download_grants_total ${this.downloadIssued}`,
      "# HELP atgt_evidence_access_denied_total Evidence access requests denied after resource recheck.",
      "# TYPE atgt_evidence_access_denied_total counter",
      `atgt_evidence_access_denied_total ${this.denied}`,
      "# HELP atgt_evidence_access_failures_total Evidence access provider or audit failures.",
      "# TYPE atgt_evidence_access_failures_total counter",
      `atgt_evidence_access_failures_total ${this.failed}`,
      "",
    ].join("\n");
  }
}
