import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  DataClass,
  PolicyAction,
  requireAccessScope,
} from "@atgt/authorization";
import {
  CreateMapVersionSchema,
  ERROR_CODES,
  MapImportPreviewRequestSchema,
  MapTransitionRequestSchema,
  PublicMapQuerySchema,
  type CreateMapVersion,
  type MapImportPreviewRequest,
  type MapTransitionRequest,
  type PublicMapQuery,
} from "@atgt/contracts";
import { createTraceId, requestContext } from "@atgt/observability";
import type { AuthorizedRequest } from "../identity/authorization.guard";
import {
  PublicRoute,
  RequirePolicy,
} from "../identity/authorization.decorators";
import { SafeHttpException } from "../../platform/safe-http.exception";
import { ZodValidationPipe } from "../../platform/zod-validation.pipe";
import {
  MapDataFailure,
  PostgresMapDataRepository,
} from "./map-data.repository";

function traceId(): string {
  return requestContext.current()?.traceId ?? createTraceId();
}

function rethrow(error: unknown): never {
  if (!(error instanceof MapDataFailure)) throw error;
  if (error.code === "NOT_FOUND") {
    throw new SafeHttpException(
      404,
      ERROR_CODES.NOT_FOUND,
      "Not found",
      error.message,
    );
  }
  if (error.code === "MAKER_CHECKER") {
    throw new SafeHttpException(
      409,
      ERROR_CODES.MAP_MAKER_CHECKER_REQUIRED,
      "Maker-checker required",
      "The submitter cannot approve the same map version",
    );
  }
  if (error.code === "INVALID_GEOMETRY") {
    throw new SafeHttpException(
      422,
      ERROR_CODES.MAP_GEOMETRY_INVALID,
      "Invalid map data",
      error.message,
    );
  }
  if (error.code === "FORBIDDEN") {
    throw new SafeHttpException(
      403,
      ERROR_CODES.FORBIDDEN,
      "Forbidden",
      "Map data access is outside the resolved scope",
    );
  }
  throw new SafeHttpException(
    409,
    ERROR_CODES.INVALID_STATE_TRANSITION,
    "Invalid transition",
    error.message,
  );
}

@Controller()
export class MapDataController {
  constructor(private readonly maps: PostgresMapDataRepository) {}

  @Get("public/map/layers/:key/features")
  @PublicRoute()
  @Header("Cache-Control", "public, max-age=30")
  async publicFeatures(
    @Param("key") key: string,
    @Query(new ZodValidationPipe(PublicMapQuerySchema)) query: PublicMapQuery,
  ) {
    try {
      return await this.maps.publicFeatures(key, query);
    } catch (error) {
      rethrow(error);
    }
  }

  @Post("admin/map/areas/:areaId/layers/:layerId/versions/preview")
  @RequirePolicy({
    action: PolicyAction.MAP_DRAFT_WRITE,
    dataClass: DataClass.INTERNAL,
    areaParam: "areaId",
  })
  async preview(
    @Param("layerId", ParseUUIDPipe) layerId: string,
    @Body(new ZodValidationPipe(MapImportPreviewRequestSchema))
    body: MapImportPreviewRequest,
  ) {
    try {
      return await this.maps.preview(
        layerId,
        body.feature_collection,
        body.schema_version,
      );
    } catch (error) {
      rethrow(error);
    }
  }

  @Post("admin/map/areas/:areaId/layers/:layerId/versions")
  @HttpCode(HttpStatus.CREATED)
  @RequirePolicy({
    action: PolicyAction.MAP_DRAFT_WRITE,
    dataClass: DataClass.INTERNAL,
    areaParam: "areaId",
  })
  async create(
    @Param("areaId") areaId: string,
    @Param("layerId", ParseUUIDPipe) layerId: string,
    @Req() request: AuthorizedRequest,
    @Body(new ZodValidationPipe(CreateMapVersionSchema)) body: CreateMapVersion,
  ) {
    try {
      const scope = requireAccessScope(request.accessScope);
      return await this.maps.createVersion(
        layerId,
        areaId,
        scope,
        body,
        traceId(),
      );
    } catch (error) {
      rethrow(error);
    }
  }

  @Post("admin/map/areas/:areaId/versions/:versionId/submit")
  @RequirePolicy({
    action: PolicyAction.MAP_DRAFT_WRITE,
    dataClass: DataClass.INTERNAL,
    areaParam: "areaId",
  })
  submit(
    @Param("areaId") areaId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Req() request: AuthorizedRequest,
    @Body(new ZodValidationPipe(MapTransitionRequestSchema))
    body: MapTransitionRequest,
  ) {
    const scope = requireAccessScope(request.accessScope);
    return this.maps
      .transition(versionId, areaId, scope, "submit", traceId(), body.reason)
      .catch(rethrow);
  }

  @Post("admin/map/areas/:areaId/versions/:versionId/approve")
  @RequirePolicy({
    action: PolicyAction.MAP_PUBLISH,
    dataClass: DataClass.INTERNAL,
    areaParam: "areaId",
  })
  approve(
    @Param("areaId") areaId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Req() request: AuthorizedRequest,
    @Body(new ZodValidationPipe(MapTransitionRequestSchema))
    body: MapTransitionRequest,
  ) {
    const scope = requireAccessScope(request.accessScope);
    return this.maps
      .transition(versionId, areaId, scope, "approve", traceId(), body.reason)
      .catch(rethrow);
  }

  @Post("admin/map/areas/:areaId/versions/:versionId/publish")
  @RequirePolicy({
    action: PolicyAction.MAP_PUBLISH,
    dataClass: DataClass.INTERNAL,
    areaParam: "areaId",
  })
  publish(
    @Param("areaId") areaId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Req() request: AuthorizedRequest,
    @Body(new ZodValidationPipe(MapTransitionRequestSchema))
    body: MapTransitionRequest,
  ) {
    const scope = requireAccessScope(request.accessScope);
    return this.maps
      .transition(versionId, areaId, scope, "publish", traceId(), body.reason)
      .catch(rethrow);
  }

  @Post("admin/map/areas/:areaId/versions/:versionId/withdraw")
  @RequirePolicy({
    action: PolicyAction.MAP_PUBLISH,
    dataClass: DataClass.INTERNAL,
    areaParam: "areaId",
  })
  withdraw(
    @Param("areaId") areaId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Req() request: AuthorizedRequest,
    @Body(new ZodValidationPipe(MapTransitionRequestSchema))
    body: MapTransitionRequest,
  ) {
    const scope = requireAccessScope(request.accessScope);
    return this.maps
      .transition(versionId, areaId, scope, "withdraw", traceId(), body.reason)
      .catch(rethrow);
  }
}
