import { createAccessScope, DataClass, OfficerRole } from "@atgt/authorization";
import { navigationForScope } from "./navigation";

const scope = (role: OfficerRole, areaIds = ["area-dalat"]) =>
  createAccessScope({
    principalId: `test-${role}`,
    role,
    areaIds,
    maxDataClass: DataClass.SENSITIVE,
    authenticationMethods: ["pwd", "mfa"],
  });

describe("authorization-aware ops navigation", () => {
  it("uses the shared policy for dispatcher and area scope", () => {
    expect(
      navigationForScope(scope(OfficerRole.DISPATCHER), "area-dalat").map(
        (item) => item.href,
      ),
    ).toEqual(["/incidents"]);
    expect(
      navigationForScope(scope(OfficerRole.DISPATCHER), "area-baoloc"),
    ).toEqual([]);
  });

  it("shows map data only to data editor/approver and no incident link to admin", () => {
    expect(
      navigationForScope(scope(OfficerRole.DATA_EDITOR), "area-dalat").map(
        (item) => item.href,
      ),
    ).toEqual(["/map-data"]);
    expect(
      navigationForScope(scope(OfficerRole.DATA_APPROVER), "area-dalat").map(
        (item) => item.href,
      ),
    ).toEqual(["/map-data"]);
    expect(
      navigationForScope(scope(OfficerRole.SYSTEM_ADMIN), "area-dalat"),
    ).toEqual([]);
  });
});
