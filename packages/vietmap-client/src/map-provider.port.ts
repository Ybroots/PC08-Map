import type { ProviderQuality } from "@atgt/contracts";

export const MAP_PROVIDER_APIS = [
  "search",
  "reverse",
  "route",
  "matrix",
] as const;

export type MapProviderApi = (typeof MAP_PROVIDER_APIS)[number];
export type ProviderCacheStatus = "MISS" | "HIT" | "STALE" | "BYPASS";

/** Mandatory metadata prevents silent degradation at every caller boundary. */
export interface ProviderMetadata {
  provider: "vietmap" | "fake";
  apiVersion: string;
  quality: ProviderQuality;
  observedAt: string;
  cacheStatus: ProviderCacheStatus;
  latencyMs: number;
}

export interface MapProviderPort {
  search(input: SearchInput, ctx: ProviderContext): Promise<SearchResult[]>;
  reverse(input: ReverseInput, ctx: ProviderContext): Promise<AddressResult>;
  route(input: RouteInput, ctx: ProviderContext): Promise<RouteResult>;
  matrix(input: MatrixInput, ctx: ProviderContext): Promise<MatrixResult>;
}

/** Contains tracing and execution budget only; never add business identifiers. */
export interface ProviderContext {
  traceId: string;
  timeoutMs: number;
  locale?: "vi" | "en";
}

export type Coordinate = readonly [longitude: number, latitude: number];

export interface SearchInput {
  query: string;
  center?: Coordinate;
  limit?: number;
}

export interface SearchResult extends ProviderMetadata {
  displayName: string;
  longitude: number;
  latitude: number;
}

export interface ReverseInput {
  longitude: number;
  latitude: number;
}

export interface AddressResult extends ProviderMetadata {
  displayAddress: string;
}

export interface RouteInput {
  origin: Coordinate;
  destination: Coordinate;
  vehicle?: "car" | "motorcycle";
}

export interface RouteResult extends ProviderMetadata {
  distanceMeters: number;
  durationSeconds: number;
  isDegraded: boolean;
}

export interface MatrixInput {
  origins: readonly Coordinate[];
  destinations: readonly Coordinate[];
  vehicle?: "car" | "motorcycle";
}

export interface MatrixResult extends ProviderMetadata {
  /** durations[i][j] is seconds from origin i to destination j. */
  durations: number[][];
  isDegraded: boolean;
}

export const MAP_PROVIDER_PORT = Symbol("MapProviderPort");
