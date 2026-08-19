import "reflect-metadata";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { DataClass, PolicyAction } from "@atgt/authorization";
import {
  CITIZEN_SESSION_METADATA,
  POLICY_METADATA,
  PUBLIC_ROUTE_METADATA,
} from "../identity/authorization.decorators";
import {
  EvidenceAccessMetricsController,
  EvidenceController,
  OpsEvidenceController,
} from "./evidence.controller";

describe("evidence route authorization coverage", () => {
  it("marks every route public-to-officers but citizen-session protected", () => {
    const prototype = EvidenceController.prototype as unknown as Record<
      string,
      object
    >;
    expect(Reflect.hasMetadata(PATH_METADATA, EvidenceController)).toBe(true);
    const methods = Object.getOwnPropertyNames(prototype).filter(
      (name) =>
        name !== "constructor" &&
        Reflect.hasMetadata(METHOD_METADATA, prototype[name]),
    );
    expect(methods).toEqual(["initiate", "finalize"]);
    for (const method of methods) {
      const handler = prototype[method];
      expect(Reflect.getMetadata(PUBLIC_ROUTE_METADATA, handler)).toBe(true);
      expect(Reflect.getMetadata(CITIZEN_SESSION_METADATA, handler)).toBe(true);
      expect(Reflect.getMetadata(POLICY_METADATA, handler)).toBeUndefined();
    }
  });

  it("protects preview and download with area, case and sensitive-data policy", () => {
    const prototype = OpsEvidenceController.prototype as unknown as Record<
      string,
      object
    >;
    const methods = Object.getOwnPropertyNames(prototype).filter(
      (name) =>
        name !== "constructor" &&
        Reflect.hasMetadata(METHOD_METADATA, prototype[name]),
    );
    expect(methods).toEqual(["preview", "download"]);
    for (const method of methods) {
      const handler = prototype[method];
      expect(
        Reflect.getMetadata(PUBLIC_ROUTE_METADATA, handler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(CITIZEN_SESSION_METADATA, handler),
      ).toBeUndefined();
      expect(Reflect.getMetadata(POLICY_METADATA, handler)).toEqual({
        action: PolicyAction.EVIDENCE_VIEW,
        dataClass: DataClass.SENSITIVE,
        areaParam: "areaId",
        caseParam: "caseId",
      });
    }
  });

  it("exposes only aggregate evidence metrics as a public scrape route", () => {
    const prototype =
      EvidenceAccessMetricsController.prototype as unknown as Record<
        string,
        object
      >;
    const handler = prototype.render;
    expect(Reflect.getMetadata(PUBLIC_ROUTE_METADATA, handler)).toBe(true);
    expect(
      Reflect.getMetadata(CITIZEN_SESSION_METADATA, handler),
    ).toBeUndefined();
    expect(Reflect.getMetadata(POLICY_METADATA, handler)).toBeUndefined();
  });
});
