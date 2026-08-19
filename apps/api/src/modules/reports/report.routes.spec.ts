import "reflect-metadata";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import {
  CITIZEN_SESSION_METADATA,
  POLICY_METADATA,
  PUBLIC_ROUTE_METADATA,
} from "../identity/authorization.decorators";
import { PolicyAction } from "@atgt/authorization";
import { OpsReportController } from "./report-ops.controller";
import { PublicReportController } from "./report.controller";

describe("citizen report route authorization coverage", () => {
  it("requires a citizen session for submit but keeps tracking anonymous", () => {
    const prototype = PublicReportController.prototype as unknown as Record<
      string,
      object
    >;
    expect(Reflect.hasMetadata(PATH_METADATA, PublicReportController)).toBe(
      true,
    );
    const methods = Object.getOwnPropertyNames(prototype).filter(
      (name) =>
        name !== "constructor" &&
        Reflect.hasMetadata(METHOD_METADATA, prototype[name]),
    );
    expect(methods).toEqual(["accept", "tracking", "attachEvidence"]);
    for (const method of methods) {
      const handler = prototype[method];
      expect(Reflect.getMetadata(PUBLIC_ROUTE_METADATA, handler)).toBe(true);
      expect(Reflect.getMetadata(POLICY_METADATA, handler)).toBeUndefined();
    }
    expect(
      Reflect.getMetadata(CITIZEN_SESSION_METADATA, prototype.accept),
    ).toBe(true);
    expect(
      Reflect.getMetadata(CITIZEN_SESSION_METADATA, prototype.tracking),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(CITIZEN_SESSION_METADATA, prototype.attachEvidence),
    ).toBe(true);
  });
});

describe("operator report route authorization coverage", () => {
  it("requires explicit scoped read and verification policies", () => {
    const prototype = OpsReportController.prototype as unknown as Record<
      string,
      object
    >;
    const methods = Object.getOwnPropertyNames(prototype).filter(
      (name) =>
        name !== "constructor" &&
        Reflect.hasMetadata(METHOD_METADATA, prototype[name]),
    );
    expect(methods).toEqual(["verificationQueue", "decide", "falsePositive"]);
    expect(
      Reflect.getMetadata(POLICY_METADATA, prototype.verificationQueue),
    ).toMatchObject({ action: PolicyAction.REPORT_READ, areaParam: "areaId" });
    for (const method of ["decide", "falsePositive"] as const) {
      expect(
        Reflect.getMetadata(POLICY_METADATA, prototype[method]),
      ).toMatchObject({
        action: PolicyAction.REPORT_VERIFY,
        areaParam: "areaId",
      });
      expect(
        Reflect.getMetadata(PUBLIC_ROUTE_METADATA, prototype[method]),
      ).toBeUndefined();
    }
  });
});
