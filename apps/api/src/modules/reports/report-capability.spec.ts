import {
  deriveReportCapability,
  isValidReportCapability,
} from "./report-capability";

describe("report capability", () => {
  const secret = "isolated-report-capability-secret-32-characters";
  const publicCode = "A3KX9M2P7Q4R";

  it("derives a stable opaque capability scoped to the public code", () => {
    const capability = deriveReportCapability(secret, publicCode);
    expect(capability).toHaveLength(43);
    expect(capability).toBe(deriveReportCapability(secret, publicCode));
    expect(capability).not.toContain(publicCode);
    expect(isValidReportCapability(secret, publicCode, capability)).toBe(true);
  });

  it("rejects wrong and differently sized capabilities without throwing", () => {
    expect(isValidReportCapability(secret, publicCode, "x".repeat(43))).toBe(
      false,
    );
    expect(isValidReportCapability(secret, publicCode, "short")).toBe(false);
  });
});
