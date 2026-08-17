import { z } from "zod";

export const MapVersionStateSchema = z.enum([
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "EXPIRED",
  "WITHDRAWN",
  "ARCHIVED",
]);
export const MapDataClassSchema = z.enum([
  "public",
  "internal",
  "sensitive",
  "restricted",
]);

const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-90).max(90);
export const PositionSchema = z.tuple([longitude, latitude]);
const lineCoordinates = z.array(PositionSchema).min(2);
const ringCoordinates = z
  .array(PositionSchema)
  .min(4)
  .refine(
    (ring) =>
      ring[0]?.[0] === ring[ring.length - 1]?.[0] &&
      ring[0]?.[1] === ring[ring.length - 1]?.[1],
    "Polygon rings must be closed",
  );

export const GeoJsonGeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: PositionSchema }).strict(),
  z
    .object({ type: z.literal("LineString"), coordinates: lineCoordinates })
    .strict(),
  z
    .object({
      type: z.literal("Polygon"),
      coordinates: z.array(ringCoordinates).min(1),
    })
    .strict(),
]);

export const MapFeatureInputSchema = z
  .object({
    type: z.literal("Feature"),
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
    geometry: GeoJsonGeometrySchema,
    properties: z.record(z.string(), z.unknown()),
  })
  .strict();

export const MapFeatureCollectionInputSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(MapFeatureInputSchema),
  })
  .strict();

export const MapImportPreviewRequestSchema = z
  .object({
    schema_version: z.number().int().positive(),
    feature_collection: MapFeatureCollectionInputSchema,
  })
  .strict();

export const MapImportIssueSchema = z
  .object({
    feature_index: z.number().int().nonnegative(),
    feature_id: z.string().optional(),
    code: z.enum([
      "GEOMETRY_INVALID",
      "GEOMETRY_TYPE_MISMATCH",
      "PROPERTIES_INVALID",
    ]),
    detail: z.string().min(1).max(500),
  })
  .strict();

export const MapImportPreviewSchema = z
  .object({
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    issues: z.array(MapImportIssueSchema),
  })
  .strict();

export const CreateMapVersionSchema = z
  .object({
    schema_version: z.number().int().positive(),
    parent_version_id: z.string().uuid().optional(),
    data_class: MapDataClassSchema,
    valid_from: z.string().datetime(),
    valid_to: z.string().datetime().optional(),
    feature_collection: MapFeatureCollectionInputSchema,
  })
  .strict()
  .refine(
    (value) =>
      !value.valid_to ||
      Date.parse(value.valid_to) > Date.parse(value.valid_from),
    { message: "valid_to must be later than valid_from", path: ["valid_to"] },
  );

export const MapVersionSchema = z
  .object({
    version_id: z.string().uuid(),
    layer_id: z.string().uuid(),
    version_number: z.number().int().positive(),
    area_id: z.string().min(1).max(100),
    data_class: MapDataClassSchema,
    state: MapVersionStateSchema,
    valid_from: z.string().datetime(),
    valid_to: z.string().datetime().nullable(),
    change_summary: z.object({
      added: z.number().int().nonnegative(),
      updated: z.number().int().nonnegative(),
      removed: z.number().int().nonnegative(),
    }),
  })
  .strict();

export const MapTransitionRequestSchema = z
  .object({ reason: z.string().trim().min(1).max(500).optional() })
  .strict();

export const PublicMapQuerySchema = z
  .object({
    bbox: z
      .string()
      .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/),
    zoom: z.coerce.number().int().min(0).max(22),
  })
  .strict()
  .superRefine((value, context) => {
    const bbox = value.bbox.split(",").map(Number) as [
      number,
      number,
      number,
      number,
    ];
    if (
      bbox[0] < -180 ||
      bbox[2] > 180 ||
      bbox[1] < -90 ||
      bbox[3] > 90 ||
      bbox[0] >= bbox[2] ||
      bbox[1] >= bbox[3]
    ) {
      context.addIssue({
        code: "custom",
        message: "bbox must be ordered EPSG:4326 [minLon,minLat,maxLon,maxLat]",
        path: ["bbox"],
      });
    }
  })
  .transform((value) => ({
    bbox: value.bbox.split(",").map(Number) as [number, number, number, number],
    zoom: value.zoom,
  }));

export const PublicMapFeatureCollectionSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    layer_key: z.string(),
    version: z.number().int().positive(),
    effective_at: z.string().datetime(),
    features: z.array(MapFeatureInputSchema),
  })
  .strict();

export const MapVersionEventDataSchema = z
  .object({
    layer_id: z.string().uuid(),
    layer_key: z.string(),
    version_id: z.string().uuid(),
    version_number: z.number().int().positive(),
    state: z.enum(["PUBLISHED", "EXPIRED", "WITHDRAWN"]),
    cache_scope: z.string().min(1),
  })
  .strict();

export type CreateMapVersion = z.infer<typeof CreateMapVersionSchema>;
export type MapFeatureInput = z.infer<typeof MapFeatureInputSchema>;
export type MapVersion = z.infer<typeof MapVersionSchema>;
export type PublicMapQuery = z.infer<typeof PublicMapQuerySchema>;
export type MapImportPreviewRequest = z.infer<
  typeof MapImportPreviewRequestSchema
>;
export type MapTransitionRequest = z.infer<typeof MapTransitionRequestSchema>;
