import { EvidenceAccessMetrics } from "./evidence-access.metrics";

describe("EvidenceAccessMetrics", () => {
  it("renders aggregate counters without evidence or principal labels", () => {
    const metrics = new EvidenceAccessMetrics();
    metrics.recordIssued("PREVIEW");
    metrics.recordIssued("DOWNLOAD");
    metrics.recordDenied();
    metrics.recordFailure();

    const rendered = metrics.renderPrometheus();
    expect(rendered).toContain("atgt_evidence_preview_grants_total 1");
    expect(rendered).toContain("atgt_evidence_download_grants_total 1");
    expect(rendered).toContain("atgt_evidence_access_denied_total 1");
    expect(rendered).toContain("atgt_evidence_access_failures_total 1");
    expect(rendered).not.toMatch(/evidence_id|principal|area_id|case_id/);
  });
});
