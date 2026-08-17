import "reflect-metadata";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import {
  CITIZEN_SESSION_METADATA,
  POLICY_METADATA,
  PUBLIC_ROUTE_METADATA,
} from "../identity/authorization.decorators";
import { EvidenceController } from "./evidence.controller";

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
});
