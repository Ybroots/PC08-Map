import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import "./zod-extend";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import {
  CreateSosSchema,
  EventEnvelopeSchema,
  ProblemDetailsSchema,
  ProviderQualitySchema,
  SosAcceptedSchema,
} from "../src";

const registry = new OpenAPIRegistry();
const createSos = registry.register("CreateSos", CreateSosSchema);
const sosAccepted = registry.register("SosAccepted", SosAcceptedSchema);
const problemDetails = registry.register(
  "ProblemDetails",
  ProblemDetailsSchema,
);
registry.register("EventEnvelope", EventEnvelopeSchema);
registry.register("ProviderQuality", ProviderQualitySchema);

registry.registerPath({
  method: "post",
  path: "/api/v1/incidents/sos",
  summary: "Submit an SOS incident",
  description: "Contract-first endpoint scheduled for implementation in T07.",
  tags: ["Incidents"],
  request: {
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
