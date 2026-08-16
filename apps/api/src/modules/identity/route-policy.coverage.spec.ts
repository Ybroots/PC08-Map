import "reflect-metadata";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { HealthController } from "../health/health.controller";
import {
  POLICY_METADATA,
  PUBLIC_ROUTE_METADATA,
} from "./authorization.decorators";
import { CitizenSessionController } from "./citizen-session.controller";

const CONTROLLERS = [HealthController, CitizenSessionController] as const;

describe("route authorization coverage", () => {
  it.each(CONTROLLERS)(
    "%s has exactly one public or protected declaration per route",
    (controller) => {
      const prototype = controller.prototype as unknown as Record<
        string,
        object
      >;
      const classIsPublic =
        Reflect.getMetadata(PUBLIC_ROUTE_METADATA, controller) === true;
      const classPolicy = Reflect.getMetadata(POLICY_METADATA, controller);
      const routeMethods = Object.getOwnPropertyNames(prototype).filter(
        (name) =>
          name !== "constructor" &&
          Reflect.hasMetadata(METHOD_METADATA, prototype[name]),
      );

      expect(Reflect.hasMetadata(PATH_METADATA, controller)).toBe(true);
      expect(routeMethods.length).toBeGreaterThan(0);
      for (const methodName of routeMethods) {
        const handler = prototype[methodName];
        const isPublic =
          Reflect.getMetadata(PUBLIC_ROUTE_METADATA, handler) === true ||
          classIsPublic;
        const policy =
          Reflect.getMetadata(POLICY_METADATA, handler) ?? classPolicy;
        expect({
          methodName,
          hasDeclaration: Boolean(isPublic || policy),
        }).toEqual({
          methodName,
          hasDeclaration: true,
        });
        expect({ methodName, ambiguous: Boolean(isPublic && policy) }).toEqual({
          methodName,
          ambiguous: false,
        });
      }
    },
  );
});
