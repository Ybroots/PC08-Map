import { z } from "zod";
import { GeoJsonGeometrySchema } from "../map/map-data.dto";

const bboxInput = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);

export const TrafficAlertVehicleTypeSchema = z.enum([
  "CAR",
  "MOTORCYCLE",
  "TRUCK",
  "BUS",
  "BICYCLE",
  "PEDESTRIAN",
  "EMERGENCY",
]);

export const TrafficAlertAudienceVehicleSchema = z.enum([
  "ALL",
  ...TrafficAlertVehicleTypeSchema.options,
]);

export const TrafficAlertPrioritySchema = z.enum([
  "INFO",
  "WARNING",
  "CRITICAL",
]);

export const TrafficAlertQuerySchema = z
  .object({
    bbox: bboxInput,
    vehicle_type: TrafficAlertVehicleTypeSchema,
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
    vehicle_type: value.vehicle_type,
  }));

export const TrafficAlertSourcePropertiesSchema = z
  .object({
    priority: TrafficAlertPrioritySchema,
    warning_vi: z.string().trim().min(1).max(300),
    action_vi: z.string().trim().min(1).max(300),
    vehicle_types: z
      .array(TrafficAlertAudienceVehicleSchema)
      .min(1)
      .max(8)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();

export const TrafficAlertSchema = z
  .object({
    alert_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/),
    layer_key: z.enum([
      "dangerous_points",
      "road_closures",
      "no_parking",
      "temp_events",
    ]),
    feature_key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
    source_version: z.number().int().positive(),
    geometry: GeoJsonGeometrySchema,
    priority: TrafficAlertPrioritySchema,
    warning_vi: z.string().min(1).max(300),
    action_vi: z.string().min(1).max(300),
    vehicle_types: z.array(TrafficAlertAudienceVehicleSchema).min(1).max(8),
    valid_from: z.string().datetime(),
    valid_to: z.string().datetime().nullable(),
  })
  .strict();

export const TrafficAlertCollectionSchema = z
  .object({
    effective_at: z.string().datetime(),
    source: z.literal("PUBLISHED_MAP_DATA"),
    quality: z.literal("PUBLISHED"),
    capability: z.literal("BBOX_ONLY"),
    alerts: z.array(TrafficAlertSchema),
  })
  .strict();

export type TrafficAlertQuery = z.infer<typeof TrafficAlertQuerySchema>;
export type TrafficAlertSourceProperties = z.infer<
  typeof TrafficAlertSourcePropertiesSchema
>;
export type TrafficAlertCollection = z.infer<
  typeof TrafficAlertCollectionSchema
>;
