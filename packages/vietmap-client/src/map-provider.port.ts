import { ProviderQuality } from "@atgt/contracts";

/**
 * MapProviderPort - Port interface for map/routing provider (VietMap)
 *
 * From ADR-005 and Section 8.2:
 * - Domain/application code MUST only depend on this interface, NEVER on vendor SDK directly
 * - ProviderContext MUST NOT contain PII, case notes, or evidence references
 * - All responses include quality/observed_at for degraded-mode transparency
 * - Implementations: HttpVietMapAdapter (production), FakeMapAdapter (test)
 *
 * CRITICAL: Do NOT call VietMap inside database transactions.
 * CRITICAL: Do NOT send incident_id, public_code, identity, or evidence to provider.
 */
export interface MapProviderPort {
  search(input: SearchInput, ctx: ProviderContext): Promise<SearchResult[]>;
  reverse(input: ReverseInput, ctx: ProviderContext): Promise<AddressResult>;
  route(input: RouteInput, ctx: ProviderContext): Promise<RouteResult>;
  matrix(input: MatrixInput, ctx: ProviderContext): Promise<MatrixResult>;
}

/**
 * ProviderContext - Request context passed to provider calls
 * MUST only contain tracing/budget/locale info. Zero PII or business identifiers.
 */
export interface ProviderContext {
  traceId: string;
  /** Budget in ms for this provider call */
  timeoutMs: number;
  /** ISO language code for results */
  locale?: "vi" | "en";
}

export interface SearchInput {
  query: string;
  /** Center point for bias - [longitude, latitude] */
  center?: [number, number];
  limit?: number;
}

export interface SearchResult {
  displayName: string;
  longitude: number;
  latitude: number;
  quality: ProviderQuality;
  observedAt: string; // UTC ISO8601
}

export interface ReverseInput {
  longitude: number;
  latitude: number;
}

export interface AddressResult {
  displayAddress: string;
  quality: ProviderQuality;
  observedAt: string;
}

export interface RouteInput {
  origin: [number, number]; // [lon, lat]
  destination: [number, number]; // [lon, lat]
  vehicle?: "car" | "motorcycle";
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  quality: ProviderQuality;
  observedAt: string;
  /** Degraded = using cached/distance-based estimate */
  isDegraded: boolean;
}

export interface MatrixInput {
  /** Origins as [lon, lat] pairs */
  origins: [number, number][];
  /** Destinations as [lon, lat] pairs */
  destinations: [number, number][];
  vehicle?: "car" | "motorcycle";
}

export interface MatrixResult {
  /** durations[i][j] = seconds from origin i to destination j */
  durations: number[][];
  quality: ProviderQuality;
  observedAt: string;
  isDegraded: boolean;
}

/** Injection token for MapProviderPort */
export const MAP_PROVIDER_PORT = Symbol("MapProviderPort");
