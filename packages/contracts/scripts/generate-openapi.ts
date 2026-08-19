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
  CitizenReportAcceptedSchema,
  CreateCitizenReportSchema,
  CreateCitizenSessionSchema,
  CreateSosSchema,
  EventEnvelopeSchema,
  EvidenceScanPendingSchema,
  EvidenceAccessGrantSchema,
  EvidenceFinalizeHeadersSchema,
  EvidenceInitiateHeadersSchema,
  EvidenceUploadInitiatedSchema,
  FinalizeEvidenceUploadSchema,
  InitiateEvidenceUploadSchema,
  CreateMapVersionSchema,
  MapImportPreviewRequestSchema,
  MapImportPreviewSchema,
  MapTransitionRequestSchema,
  MapVersionSchema,
  PublicMapFeatureCollectionSchema,
  PublicIncidentTrackingSchema,
  PublicReportTrackingSchema,
  ProblemDetailsSchema,
  ProviderQualitySchema,
  SosAcceptedSchema,
  SosIdempotencyHeadersSchema,
  ReportIdempotencyHeadersSchema,
  ReportEvidenceLinkHeadersSchema,
  ReportEvidenceLinkedSchema,
  OpsIncidentFeedQuerySchema,
  OpsIncidentFeedSchema,
  OpsIncidentSchema,
  OpsIncidentTransitionRequestSchema,
  OpsReportSchema,
  OpsReportDuplicateCandidateSchema,
  OpsReportVerificationQueueQuerySchema,
  OpsReportVerificationQueueSchema,
  OpsReportVerificationDecisionSchema,
  DuplicateFalsePositiveRequestSchema,
  TrafficAlertCollectionSchema,
} from "../src";

const registry = new OpenAPIRegistry();
const initiateEvidenceUpload = registry.register(
  "InitiateEvidenceUpload",
  InitiateEvidenceUploadSchema,
);
const evidenceUploadInitiated = registry.register(
  "EvidenceUploadInitiated",
  EvidenceUploadInitiatedSchema,
);
const finalizeEvidenceUpload = registry.register(
  "FinalizeEvidenceUpload",
  FinalizeEvidenceUploadSchema,
);
const evidenceScanPending = registry.register(
  "EvidenceScanPending",
  EvidenceScanPendingSchema,
);
const evidenceAccessGrant = registry.register(
  "EvidenceAccessGrant",
  EvidenceAccessGrantSchema,
);
const evidenceInitiateHeaders = registry.register(
  "EvidenceInitiateHeaders",
  EvidenceInitiateHeadersSchema,
);
const evidenceFinalizeHeaders = registry.register(
  "EvidenceFinalizeHeaders",
  EvidenceFinalizeHeadersSchema,
);
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
const createCitizenReport = registry.register(
  "CreateCitizenReport",
  CreateCitizenReportSchema,
);
const citizenReportAccepted = registry.register(
  "CitizenReportAccepted",
  CitizenReportAcceptedSchema,
);
const reportHeaders = registry.register(
  "ReportIdempotencyHeaders",
  ReportIdempotencyHeadersSchema,
);
const publicReportTracking = registry.register(
  "PublicReportTracking",
  PublicReportTrackingSchema,
);
const reportEvidenceLinkHeaders = registry.register(
  "ReportEvidenceLinkHeaders",
  ReportEvidenceLinkHeadersSchema,
);
const reportEvidenceLinked = registry.register(
  "ReportEvidenceLinked",
  ReportEvidenceLinkedSchema,
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
const opsReport = registry.register("OpsReport", OpsReportSchema);
const opsReportDuplicateCandidate = registry.register(
  "OpsReportDuplicateCandidate",
  OpsReportDuplicateCandidateSchema,
);
const opsReportVerificationQueue = registry.register(
  "OpsReportVerificationQueue",
  OpsReportVerificationQueueSchema,
);
const opsReportVerificationDecision = registry.register(
  "OpsReportVerificationDecision",
  OpsReportVerificationDecisionSchema,
);
const duplicateFalsePositiveRequest = registry.register(
  "DuplicateFalsePositiveRequest",
  DuplicateFalsePositiveRequestSchema,
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
const trafficAlerts = registry.register(
  "TrafficAlertCollection",
  TrafficAlertCollectionSchema,
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
  method: "post",
  path: "/api/v1/public/reports",
  summary: "Submit an anonymous citizen report",
  description:
    "Atomically accepts a PII-free report. Citizen input and plate text remain unverified.",
  tags: ["Reports"],
  request: {
    headers: reportHeaders,
    body: {
      required: true,
      content: { "application/json": { schema: createCitizenReport } },
    },
  },
  responses: {
    202: {
      description: "Citizen report accepted",
      content: { "application/json": { schema: citizenReportAccepted } },
    },
    401: {
      description: "Citizen session missing, invalid, expired or revoked",
      content: { "application/problem+json": { schema: problemDetails } },
    },
    409: {
      description: "Idempotency conflict",
      content: { "application/problem+json": { schema: problemDetails } },
    },
    422: {
      description: "Citizen report category unavailable",
      content: { "application/problem+json": { schema: problemDetails } },
    },
    503: {
      description: "Citizen report intake is configuration-blocked",
      content: { "application/problem+json": { schema: problemDetails } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/public/reports/{publicCode}",
  summary: "Read the generalized public status for a citizen report",
  tags: ["Reports"],
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
      content: { "application/json": { schema: publicReportTracking } },
    },
    404: {
      description: "Invalid and unknown codes use the same response",
      content: { "application/problem+json": { schema: problemDetails } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/public/reports/{publicCode}/evidence/{evidenceId}",
  summary: "Attach a READY evidence object to an anonymous report",
  description:
    "Requires a live citizen session plus independent report and upload capabilities. It never verifies the report or creates an enforcement decision.",
  tags: ["Reports", "Evidence"],
  request: {
    params: z.object({
      publicCode: z.string().openapi({
        param: { name: "publicCode", in: "path" },
      }),
      evidenceId: z
        .string()
        .uuid()
        .openapi({
          param: { name: "evidenceId", in: "path" },
        }),
    }),
    headers: reportEvidenceLinkHeaders,
  },
  responses: {
    200: {
      description: "Evidence ownership attached or exact attachment replayed",
      content: { "application/json": { schema: reportEvidenceLinked } },
    },
    401: {
      description: "Citizen session missing, invalid, expired or revoked",
      content: { "application/problem+json": { schema: problemDetails } },
    },
    404: {
      description:
        "Invalid capability, non-READY evidence and ownership conflicts use a uniform response",
      content: { "application/problem+json": { schema: problemDetails } },
    },
    503: {
      description: "Evidence linking is configuration-blocked",
      content: { "application/problem+json": { schema: problemDetails } },
    },
  },
});

const evidenceAreaParameter = registry.registerParameter(
  "EvidenceAreaId",
  z.string().openapi({ param: { name: "areaId", in: "path" } }),
);
const evidenceCaseParameter = registry.registerParameter(
  "EvidenceCaseId",
  z
    .string()
    .uuid()
    .openapi({ param: { name: "caseId", in: "path" } }),
);
const evidenceIdParameter = registry.registerParameter(
  "EvidenceId",
  z
    .string()
    .uuid()
    .openapi({ param: { name: "evidenceId", in: "path" } }),
);

for (const access of ["preview", "download"] as const) {
  registry.registerPath({
    method: "get",
    path: `/api/v1/ops/areas/{areaId}/cases/{caseId}/evidence/{evidenceId}/${access}`,
    summary:
      access === "preview"
        ? "Issue a scoped derivative preview URL"
        : "Issue a scoped immutable-original download URL",
    description:
      "Requires evidence.view over the actual area, assigned case and data classification. Every URL issuance is audited.",
    tags: ["Evidence"],
    request: {
      params: z.object({
        areaId: evidenceAreaParameter,
        caseId: evidenceCaseParameter,
        evidenceId: evidenceIdParameter,
      }),
    },
    responses: {
      200: {
        description: "Short-lived access grant; never contains an object key",
        content: { "application/json": { schema: evidenceAccessGrant } },
      },
      403: {
        description: "Officer scope or data classification denied and audited",
        content: { "application/problem+json": { schema: problemDetails } },
      },
      404: {
        description: "Unknown and out-of-scope evidence use the same response",
        content: { "application/problem+json": { schema: problemDetails } },
      },
      503: {
        description: "Evidence reader or storage is unavailable",
        content: { "application/problem+json": { schema: problemDetails } },
      },
    },
  });
}

registry.registerPath({
  method: "post",
  path: "/api/v1/public/uploads/initiate",
  summary: "Initiate a quarantine evidence upload",
  description:
    "Returns a short-lived upload authorization without exposing the server-generated object key.",
  tags: ["Evidence"],
  request: {
    headers: evidenceInitiateHeaders,
    body: {
      required: true,
      content: { "application/json": { schema: initiateEvidenceUpload } },
    },
  },
  responses: {
    201: {
      description: "Quarantine upload authorization created",
      content: { "application/json": { schema: evidenceUploadInitiated } },
    },
    503: {
      description: "Evidence pipeline is configuration-blocked",
      content: { "application/problem+json": { schema: problemDetails } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/public/uploads/{uploadId}/finalize",
  summary: "Finalize a quarantine upload and request scanning",
  tags: ["Evidence"],
  request: {
    params: z.object({
      uploadId: z
        .string()
        .uuid()
        .openapi({
          param: { name: "uploadId", in: "path" },
        }),
    }),
    headers: evidenceFinalizeHeaders,
    body: {
      required: true,
      content: { "application/json": { schema: finalizeEvidenceUpload } },
    },
  },
  responses: {
    202: {
      description: "Upload accepted into the asynchronous scan pipeline",
      content: { "application/json": { schema: evidenceScanPending } },
    },
    409: {
      description: "Upload state or checksum conflict",
      content: { "application/problem+json": { schema: problemDetails } },
    },
    503: {
      description: "Evidence pipeline is configuration-blocked",
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

const reportAreaParameter = registry.registerParameter(
  "ReportAreaId",
  z.string().openapi({ param: { name: "areaId", in: "path" } }),
);
const reportIdParameter = registry.registerParameter(
  "ReportId",
  z
    .string()
    .uuid()
    .openapi({ param: { name: "reportId", in: "path" } }),
);
const duplicateCandidateIdParameter = registry.registerParameter(
  "DuplicateCandidateId",
  z
    .string()
    .uuid()
    .openapi({ param: { name: "candidateId", in: "path" } }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/ops/areas/{areaId}/reports/verification",
  summary: "Resume the scoped citizen report verification queue",
  description:
    "Returns only PENDING_VERIFICATION reports. Duplicate candidates are suggestions and never conclusions.",
  tags: ["Reports"],
  request: {
    params: z.object({ areaId: reportAreaParameter }),
    query: OpsReportVerificationQueueQuerySchema,
  },
  responses: {
    200: {
      description: "Scoped verification queue page",
      content: { "application/json": { schema: opsReportVerificationQueue } },
    },
    403: {
      description: "Area or data-class scope denied",
      content: { "application/problem+json": { schema: problemDetails } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/ops/areas/{areaId}/reports/{reportId}/verification",
  summary: "Apply an operator citizen report verification decision",
  description:
    "Uses optimistic versions. DUPLICATE requires the operator to confirm a pending candidate explicitly.",
  tags: ["Reports"],
  request: {
    params: z.object({
      areaId: reportAreaParameter,
      reportId: reportIdParameter,
    }),
    body: {
      required: true,
      content: {
        "application/json": { schema: opsReportVerificationDecision },
      },
    },
  },
  responses: {
    200: {
      description: "Verification decision committed with audit and outbox",
      content: { "application/json": { schema: opsReport } },
    },
    409: {
      description: "State, report version, or candidate version conflict",
      content: { "application/problem+json": { schema: problemDetails } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/ops/areas/{areaId}/reports/{reportId}/duplicate-candidates/{candidateId}/false-positive",
  summary: "Override a duplicate suggestion as a false positive",
  description:
    "Leaves the report pending for verification and records the operator override atomically.",
  tags: ["Reports"],
  request: {
    params: z.object({
      areaId: reportAreaParameter,
      reportId: reportIdParameter,
      candidateId: duplicateCandidateIdParameter,
    }),
    body: {
      required: true,
      content: {
        "application/json": { schema: duplicateFalsePositiveRequest },
      },
    },
  },
  responses: {
    200: {
      description: "Suggestion marked false-positive",
      content: {
        "application/json": { schema: opsReportDuplicateCandidate },
      },
    },
    409: {
      description: "Report state or candidate version conflict",
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

registry.registerPath({
  method: "get",
  path: "/api/v1/public/traffic-alerts",
  summary: "Read current published traffic alerts inside a bbox",
  description:
    "T13A bbox-only projection. It does not claim route, direction or anti-repeat capability.",
  tags: ["Traffic alerts"],
  request: {
    query: z.object({
      bbox: z.string().openapi({
        param: { name: "bbox", in: "query" },
        example: "108.40,11.90,108.50,11.98",
      }),
      vehicle_type: z
        .enum([
          "CAR",
          "MOTORCYCLE",
          "TRUCK",
          "BUS",
          "BICYCLE",
          "PEDESTRIAN",
          "EMERGENCY",
        ])
        .openapi({ param: { name: "vehicle_type", in: "query" } }),
    }),
  },
  responses: {
    200: {
      description: "Sanitized alerts from current published map data",
      content: { "application/json": { schema: trafficAlerts } },
    },
    422: {
      description: "Bounding box exceeds explicit deployment safety bounds",
      content: { "application/problem+json": { schema: problemDetails } },
    },
    503: {
      description: "Projection disabled or a published source is malformed",
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
