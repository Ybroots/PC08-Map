import "reflect-metadata";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import {
  POLICY_METADATA,
  PUBLIC_ROUTE_METADATA,
} from "../identity/authorization.decorators";
import {
  IncidentMetricsController,
  OpsIncidentController,
  PublicIncidentController,
} from "./incident.controller";

const CONTROLLERS = [
  PublicIncidentController,
  OpsIncidentController,
  IncidentMetricsController,
] as const;

describe("incident route authorization coverage", () => {
  it.each(CONTROLLERS)(
    "%s declares every route public or policy-protected",
    (controller) => {
      const prototype = controller.prototype as unknown as Record<
        string,
        object
      >;
      const methods = Object.getOwnPropertyNames(prototype).filter(
        (name) =>
          name !== "constructor" &&
          Reflect.hasMetadata(METHOD_METADATA, prototype[name]),
      );
      expect(Reflect.hasMetadata(PATH_METADATA, controller)).toBe(true);
      expect(methods.length).toBeGreaterThan(0);
      for (const method of methods) {
        const handler = prototype[method];
        const isPublic =
          Reflect.getMetadata(PUBLIC_ROUTE_METADATA, handler) === true;
        const policy = Reflect.getMetadata(POLICY_METADATA, handler);
        expect(Boolean(isPublic || policy)).toBe(true);
        expect(Boolean(isPublic && policy)).toBe(false);
      }
    },
  );
});
