import "reflect-metadata";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import {
  CITIZEN_SESSION_METADATA,
  POLICY_METADATA,
  PUBLIC_ROUTE_METADATA,
} from "../identity/authorization.decorators";
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
    expect(methods).toEqual(["accept", "tracking"]);
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
  });
});
