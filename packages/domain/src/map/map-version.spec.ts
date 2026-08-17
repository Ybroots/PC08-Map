import {
  approveMapVersion,
  expireMapVersion,
  MapVersionRuleViolation,
  publishMapVersion,
  submitMapVersion,
  type MapVersionSnapshot,
} from "./map-version";

const base = (): MapVersionSnapshot => ({
  state: "DRAFT",
  createdBy: "editor-a",
  validFrom: new Date("2026-08-17T00:00:00Z"),
  validTo: new Date("2026-08-18T00:00:00Z"),
});

describe("map version lifecycle", () => {
  it("enforces a different submitter and approver", () => {
    const review = submitMapVersion(base(), "editor-a");
    expect(() => approveMapVersion(review, "editor-a")).toThrow(
      new MapVersionRuleViolation("MAKER_CHECKER"),
    );
    expect(approveMapVersion(review, "approver-b").state).toBe("APPROVED");
  });

  it("publishes only inside the effective clock", () => {
    const approved = approveMapVersion(
      submitMapVersion(base(), "editor-a"),
      "approver-b",
    );
    expect(() =>
      publishMapVersion(approved, new Date("2026-08-16T23:59:59Z")),
    ).toThrow(MapVersionRuleViolation);
    expect(
      publishMapVersion(approved, new Date("2026-08-17T00:00:00Z")).state,
    ).toBe("PUBLISHED");
  });

  it("expires only when valid_to has elapsed", () => {
    const published: MapVersionSnapshot = { ...base(), state: "PUBLISHED" };
    expect(() =>
      expireMapVersion(published, new Date("2026-08-17T23:59:59Z")),
    ).toThrow(MapVersionRuleViolation);
    expect(
      expireMapVersion(published, new Date("2026-08-18T00:00:00Z")).state,
    ).toBe("EXPIRED");
  });
});
