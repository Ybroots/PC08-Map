import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { z } from "zod";
import "./zod-extend";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import {
  CitizenSessionHeaderSchema,
  CitizenSessionSchema,
  CreateCitizenSessionSchema,
  CreateSosSchema,
  EventEnvelopeSchema,
  CreateMapVersionSchema,
  MapImportPreviewRequestSchema,
  MapImportPreviewSchema,
  MapTransitionRequestSchema,
  MapVersionSchema,
  PublicMapFeatureCollectionSchema,
  PublicIncidentTrackingSchema,
  ProblemDetailsSchema,
  ProviderQualitySchema,
  SosAcceptedSchema,
  SosIdempotencyHeadersSchema,
  OpsIncidentFeedQuerySchema,
  OpsIncidentFeedSchema,
  OpsIncidentSchema,
  OpsIncidentTransitionRequestSchema,
} from "../src";

const registry = new OpenAPIRegistry();
const createSos = registry.register("CreateSos", CreateSosSchema);
const sosAccepted = registry.register("SosAccepted", SosAcceptedSchema);
const sosHeaders = registry.register(
  "SosIdempotencyHeaders",
  SosIdempotencyHeadersSchema,
);
const publicIncidentTracking = registry.register(
  "PublicIncidentTracking",
  PublicIncidentTrackingSchema,
);
const opsIncident = registry.register("OpsIncident", OpsIncidentSchema);
const opsIncidentFeed = registry.register(
  "OpsIncidentFeed",
  OpsIncidentFeedSchema,
);
const opsIncidentTransition = registry.register(
  "OpsIncidentTransitionRequest",
  OpsIncidentTransitionRequestSchema,
);
const problemDetails = registry.register(
  "ProblemDetails",
  ProblemDetailsSchema,
);
const createCitizenSession = registry.register(
  "CreateCitizenSession",
  CreateCitizenSessionSchema,
);
const citizenSession = registry.register(
  "CitizenSession",
  CitizenSessionSchema,
);
const citizenSessionHeader = registry.register(
  "CitizenSessionHeader",
  CitizenSessionHeaderSchema,
);
registry.register("EventEnvelope", EventEnvelopeSchema);
registry.register("ProviderQuality", ProviderQualitySchema);
const createMapVersion = registry.register(
  "CreateMapVersion",
  CreateMapVersionSchema,
);
const mapVersion = registry.register("MapVersion", MapVersionSchema);
const mapPreviewRequest = registry.register(
  "MapImportPreviewRequest",
  MapImportPreviewRequestSchema,
);
const mapPreview = registry.register(
  "MapImportPreview",
  MapImportPreviewSchema,
);
const mapTransition = registry.register(
  "MapTransition",
  MapTransitionRequestSchema,
);
const publicMap = registry.register(
  "PublicMapFeatureCollection",
  PublicMapFeatureCollectionSchema,
);

registry.registerPath({
  method: "post",
  path: "/api/v1/public/sos",
  summary: "Submit an SOS incident",
  description:
    "Atomically accepts an SOS without calling map, routing or notification providers.",
  tags: ["Incidents"],
  request: {
    headers: sosHeaders,
    body: {
      required: true,
      content: { "application/json": { schema: createSos } },
    },
  },
  responses: {
    202: {
      description: "SOS accepted",
      content: { "application/json": { schema: sosAccepted } },
    },
    400: {
      description: "Invalid request",
      content: { "application/problem+json": { schema: problemDetails } },
    },
    409: {
      description: "Idempotency conflict",
      content: { "application/problem+json": { schema: problemDetails } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/public/cases/{publicCode}",
  summary: "Read the generalized public status for a tracking code",
  tags: ["Incidents"],
  request: {
    params: z.object({
      publicCode: z.string().openapi({
        param: { name: "publicCode", in: "path" },
        example: "A3KX9M2P7Q4R",
      }),
    }),
  },
  responses: {
    200: {
      description: "Generalized status only",
      content: {
        "application/json": { schema: publicIncidentTracking },
      },
    },
    404: {
      description: "Invalid and unknown codes use the same response",
      content: { "application/problem+json": { schema: problemDetails } },
    },
  },
});

const incidentAreaParameter = registry.registerParameter(
  "IncidentAreaId",
  z.string().openapi({ param: { name: "areaId", in: "path" } }),
);
const incidentIdParameter = registry.registerParameter(
  "IncidentId",
  z
    .string()
    .uuid()
    .openapi({ param: { name: "incidentId", in: "path" } }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/ops/areas/{areaId}/incidents/feed",
  summary: "Resume the scoped operations incident feed",
  tags: ["Incidents"],
  request: {
    params: z.object({ areaId: incidentAreaParameter }),
    query: OpsIncidentFeedQuerySchema,
  },
  responses: {
    200: {
      description: "Scoped append-only feed page",
      content: { "application/json": { schema: opsIncidentFeed } },
    },
    403: {
      description: "Area or data-class scope denied",
      content: { "application/problem+json": { schema: problemDetails } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/ops/areas/{areaId}/incidents/{incidentId}/transitions",
  summary: "Apply an authorized incident transition",
  tags: ["Incidents"],
  request: {
    params: z.object({
      areaId: incidentAreaParameter,
      incidentId: incidentIdParameter,
    }),
    body: {
      required: true,
      content: { "application/json": { schema: opsIncidentTransition } },
    },
  },
  responses: {
    200: {
      description: "Transition applied",
      content: { "application/json": { schema: opsIncident } },
    },
    409: {
      description: "State precondition or optimistic version conflict",
      content: { "application/problem+json": { schema: problemDetails } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/public/map/layers/{key}/features",
  summary: "Read the currently effective public map version inside a bbox",
  tags: ["Map data"],
  request: {
    params: registry.registerParameter(
      "MapLayerKey",
      z.string().openapi({ param: { name: "key", in: "path" } }),
    ),
    query: z.object({
      bbox: z.string().openapi({
        param: { name: "bbox", in: "query" },
        example: "108.40,11.90,108.50,11.98",
      }),
      zoom: z.coerce
        .number()
        .int()
        .min(0)
        .max(22)
        .openapi({ param: { name: "zoom", in: "query" }, example: 13 }),
    }),
  },
  responses: {
    200: {
      description: "Published, public, currently effective features only",
      content: { "application/json": { schema: publicMap } },
    },
    404: {
      description: "No effective public version",
      content: { "application/problem+json": { schema: problemDetails } },
    },
  },
});

const areaParameter = registry.registerParameter(
  "MapAreaId",
  z.string().openapi({ param: { name: "areaId", in: "path" } }),
);
const layerIdParameter = registry.registerParameter(
  "MapLayerId",
  z
    .string()
    .uuid()
    .openapi({ param: { name: "layerId", in: "path" } }),
);
const versionIdParameter = registry.registerParameter(
  "MapVersionId",
  z
    .string()
    .uuid()
    .openapi({ param: { name: "versionId", in: "path" } }),
);

registry.registerPath({
  method: "post",
  path: "/api/v1/admin/map/areas/{areaId}/layers/{layerId}/versions/preview",
  summary: "Validate a GeoJSON import without writing it",
  tags: ["Map data"],
  request: {
    params: z.object({ areaId: areaParameter, layerId: layerIdParameter }),
    body: {
      required: true,
      content: { "application/json": { schema: mapPreviewRequest } },
    },
  },
  responses: {
    201: {
      description: "Per-feature validation report",
      content: { "application/json": { schema: mapPreview } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/admin/map/areas/{areaId}/layers/{layerId}/versions",
  summary: "Create an immutable-on-submit map version draft",
  tags: ["Map data"],
  request: {
    params: z.object({ areaId: areaParameter, layerId: layerIdParameter }),
    body: {
      required: true,
      content: { "application/json": { schema: createMapVersion } },
    },
  },
  responses: {
    201: {
      description: "Draft created",
      content: { "application/json": { schema: mapVersion } },
    },
  },
});

for (const action of ["submit", "approve", "publish", "withdraw"] as const) {
  registry.registerPath({
    method: "post",
    path: `/api/v1/admin/map/areas/{areaId}/versions/{versionId}/${action}`,
    summary: `${action[0]!.toUpperCase()}${action.slice(1)} a map version`,
    tags: ["Map data"],
    request: {
      params: z.object({
        areaId: areaParameter,
        versionId: versionIdParameter,
      }),
      body: {
        required: true,
        content: { "application/json": { schema: mapTransition } },
      },
    },
    responses: {
      201: {
        description: "Lifecycle transition accepted",
        content: { "application/json": { schema: mapVersion } },
      },
      409: {
        description: "Invalid state or maker-checker conflict",
        content: { "application/problem+json": { schema: problemDetails } },
      },
    },
  });
}

registry.registerPath({
  method: "post",
  path: "/api/v1/public/sessions",
  summary: "Create an anonymous citizen session",
  tags: ["Identity"],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createCitizenSession } },
    },
  },
  responses: {
    201: {
      description: "Anonymous session created",
      content: { "application/json": { schema: citizenSession } },
    },
    400: {
      description: "Invalid request",
      content: { "application/problem+json": { schema: problemDetails } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/public/sessions/rotate",
  summary: "Rotate an anonymous citizen session",
  tags: ["Identity"],
  request: { headers: citizenSessionHeader },
  responses: {
    201: {
      description: "Replacement session created and previous session revoked",
      content: { "application/json": { schema: citizenSession } },
    },
    401: {
      description: "Session expired, revoked, or invalid",
      content: { "application/problem+json": { schema: problemDetails } },
    },
  },
});

const document = new OpenApiGeneratorV31(registry.definitions).generateDocument(
  {
    openapi: "3.1.0",
    info: {
      title: "ATGT Lâm Đồng API",
      version: "0.0.1",
      description:
        "Executable API contracts. Runtime endpoints may be delivered by later tasks.",
    },
    servers: [{ url: "http://localhost:3000" }],
  },
);

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(packageRoot, "openapi/openapi.json");

async function main(): Promise<void> {
  const serialized = await format(JSON.stringify(document), { parser: "json" });
  if (process.argv.includes("--check")) {
    const current = readFileSync(outputPath, "utf8");
    if (current !== serialized) {
      throw new Error(
        "OpenAPI artifact is stale. Run pnpm --filter @atgt/contracts openapi:generate",
      );
    }
  } else {
    writeFileSync(outputPath, serialized, "utf8");
    process.stdout.write(`Generated ${outputPath}\n`);
  }
}

void main();
