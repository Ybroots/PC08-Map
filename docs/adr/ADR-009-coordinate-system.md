# ADR-009: Coordinate System

**Status**: ACCEPTED  
**Date**: 2026-08-16

## Decision

- API boundary: EPSG:4326, GeoJSON format, coordinate order `[longitude, latitude]`
- PostGIS storage: `geography(Point, 4326)` for distance-in-meters queries; `geometry` with GiST index for polygon/line operations
- When coordinate conversion is needed: store `original_coordinate`, `normalized_coordinate`, `accuracy_m`, `source_crs`, `normalization_method`

## Consequences

- All API clients must use `[lon, lat]` order (GeoJSON standard)
- No implicit CRS conversion in domain layer; conversion is explicit and audited
- VietMap requests use same coordinate system
