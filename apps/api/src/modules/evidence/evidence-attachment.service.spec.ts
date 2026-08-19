import { hashUploadCapability } from "./evidence-capability";
import { EvidenceAttachmentService } from "./evidence-attachment.service";

describe("EvidenceAttachmentService", () => {
  it("passes only the capability hash to the atomic READY attachment function", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ attached_now: true }],
      rowCount: 1,
    });
    const service = new EvidenceAttachmentService();
    const uploadCapability = "upload-capability-that-must-not-reach-postgres";

    await expect(
      service.attachReadyToReport(
        { query },
        {
          evidenceId: "550e8400-e29b-41d4-a716-446655440000",
          reportId: "650e8400-e29b-41d4-a716-446655440000",
          areaId: "synthetic-area",
          uploadCapability,
        },
      ),
    ).resolves.toEqual({ attachedNow: true });
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      "550e8400-e29b-41d4-a716-446655440000",
      "650e8400-e29b-41d4-a716-446655440000",
      "synthetic-area",
      hashUploadCapability(uploadCapability),
    ]);
    expect(JSON.stringify(query.mock.calls)).not.toContain(uploadCapability);
  });

  it("uses a uniform null result when READY/capability/ownership does not match", async () => {
    const service = new EvidenceAttachmentService();
    await expect(
      service.attachReadyToReport(
        { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
        {
          evidenceId: "550e8400-e29b-41d4-a716-446655440000",
          reportId: "650e8400-e29b-41d4-a716-446655440000",
          areaId: "synthetic-area",
          uploadCapability: "x".repeat(43),
        },
      ),
    ).resolves.toBeNull();
  });
});
