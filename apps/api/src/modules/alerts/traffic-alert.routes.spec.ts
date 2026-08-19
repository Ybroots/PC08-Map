import "reflect-metadata";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import {
  POLICY_METADATA,
  PUBLIC_ROUTE_METADATA,
} from "../identity/authorization.decorators";
import { TrafficAlertController } from "./traffic-alert.controller";

describe("traffic alert route authorization coverage", () => {
  it("declares the bbox projection as explicitly public without an ops policy", () => {
    const prototype = TrafficAlertController.prototype as unknown as Record<
      string,
      object
    >;
    expect(Reflect.hasMetadata(PATH_METADATA, TrafficAlertController)).toBe(
      true,
    );
    expect(Reflect.hasMetadata(METHOD_METADATA, prototype.list)).toBe(true);
    expect(Reflect.getMetadata(PUBLIC_ROUTE_METADATA, prototype.list)).toBe(
      true,
    );
    expect(
      Reflect.getMetadata(POLICY_METADATA, prototype.list),
    ).toBeUndefined();
  });
});
