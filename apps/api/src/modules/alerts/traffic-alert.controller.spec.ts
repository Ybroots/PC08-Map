import { ERROR_CODES } from "@atgt/contracts";
import { SafeHttpException } from "../../platform/safe-http.exception";
import { TrafficAlertController } from "./traffic-alert.controller";
import {
  PostgresTrafficAlertRepository,
  TrafficAlertFailure,
} from "./traffic-alert.repository";

const query = {
  bbox: [108.4, 11.9, 108.5, 11.98] as [number, number, number, number],
  vehicle_type: "CAR" as const,
};

describe("TrafficAlertController", () => {
  it.each([
    ["CONFIGURATION_BLOCKED", 503, ERROR_CODES.CONFIGURATION_BLOCKED],
    ["SOURCE_INVALID", 503, ERROR_CODES.CONFIGURATION_BLOCKED],
    ["QUERY_TOO_BROAD", 422, ERROR_CODES.TRAFFIC_ALERT_QUERY_TOO_BROAD],
  ] as const)(
    "maps %s to a stable public problem",
    async (code, status, errorCode) => {
      const repository = {
        list: jest.fn().mockRejectedValue(new TrafficAlertFailure(code)),
      } as unknown as PostgresTrafficAlertRepository;
      const controller = new TrafficAlertController(repository);
      try {
        await controller.list(query);
        throw new Error("Expected controller to reject");
      } catch (error) {
        expect(error).toBeInstanceOf(SafeHttpException);
        expect(error).toMatchObject({ errorCode });
        expect((error as SafeHttpException).getStatus()).toBe(status);
      }
    },
  );
});
