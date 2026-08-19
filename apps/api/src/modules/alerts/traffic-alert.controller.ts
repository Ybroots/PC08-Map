import { Controller, Get, Header, Query } from "@nestjs/common";
import {
  ERROR_CODES,
  TrafficAlertQuerySchema,
  type TrafficAlertCollection,
  type TrafficAlertQuery,
} from "@atgt/contracts";
import { SafeHttpException } from "../../platform/safe-http.exception";
import { ZodValidationPipe } from "../../platform/zod-validation.pipe";
import { PublicRoute } from "../identity/authorization.decorators";
import {
  PostgresTrafficAlertRepository,
  TrafficAlertFailure,
} from "./traffic-alert.repository";

function rethrow(error: unknown): never {
  if (!(error instanceof TrafficAlertFailure)) throw error;
  if (error.code === "QUERY_TOO_BROAD") {
    throw new SafeHttpException(
      422,
      ERROR_CODES.TRAFFIC_ALERT_QUERY_TOO_BROAD,
      "Traffic alert query too broad",
      "Use a smaller bounding box for this deployment",
    );
  }
  throw new SafeHttpException(
    503,
    ERROR_CODES.CONFIGURATION_BLOCKED,
    "Traffic alerts unavailable",
    "The published traffic-alert projection is not available for this deployment",
  );
}

@Controller("public/traffic-alerts")
export class TrafficAlertController {
  constructor(private readonly alerts: PostgresTrafficAlertRepository) {}

  @Get()
  @PublicRoute()
  @Header("Cache-Control", "public, max-age=30")
  async list(
    @Query(new ZodValidationPipe(TrafficAlertQuerySchema))
    query: TrafficAlertQuery,
  ): Promise<TrafficAlertCollection> {
    try {
      return await this.alerts.list(query);
    } catch (error) {
      rethrow(error);
    }
  }
}
