import {
  OpsIncidentFeedQuerySchema,
  OpsIncidentFeedSchema,
  ProblemDetailsSchema,
  type OpsIncidentFeed,
} from "@atgt/contracts";

export type IncidentFeedClientFailure =
  "AUTH_REQUIRED" | "FORBIDDEN" | "UPSTREAM" | "NETWORK" | "CONTRACT";

export class IncidentFeedClientError extends Error {
  constructor(readonly code: IncidentFeedClientFailure) {
    super(code);
    this.name = "IncidentFeedClientError";
  }
}

export interface IncidentFeedRequest {
  apiBaseUrl: string;
  areaId: string;
  after: string;
  limit: number;
  bearerToken: string;
  signal?: AbortSignal;
}

type FetchPort = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

function endpoint(baseUrl: string, areaId: string): URL {
  const base = new URL(baseUrl);
  if (
    (base.protocol !== "http:" && base.protocol !== "https:") ||
    base.pathname !== "/"
  ) {
    throw new IncidentFeedClientError("CONTRACT");
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new IncidentFeedClientError("CONTRACT");
  }
  return new URL(
    `api/v1/ops/areas/${encodeURIComponent(areaId)}/incidents/feed`,
    base.href.endsWith("/") ? base : `${base.href}/`,
  );
}

export async function fetchIncidentFeed(
  request: IncidentFeedRequest,
  fetchPort: FetchPort = fetch,
): Promise<OpsIncidentFeed> {
  const query = OpsIncidentFeedQuerySchema.safeParse({
    after: request.after,
    limit: request.limit,
  });
  if (!query.success || !request.areaId.trim() || !request.bearerToken.trim()) {
    throw new IncidentFeedClientError("CONTRACT");
  }
  const url = endpoint(request.apiBaseUrl, request.areaId.trim());
  url.searchParams.set("after", query.data.after);
  url.searchParams.set("limit", String(query.data.limit));

  let response: Awaited<ReturnType<FetchPort>>;
  try {
    response = await fetchPort(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${request.bearerToken}`,
      },
      cache: "no-store",
      credentials: "omit",
      signal: request.signal,
    });
  } catch {
    throw new IncidentFeedClientError("NETWORK");
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    ProblemDetailsSchema.safeParse(body);
    if (response.status === 401)
      throw new IncidentFeedClientError("AUTH_REQUIRED");
    if (response.status === 403) throw new IncidentFeedClientError("FORBIDDEN");
    throw new IncidentFeedClientError("UPSTREAM");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new IncidentFeedClientError("CONTRACT");
  }
  const parsed = OpsIncidentFeedSchema.safeParse(body);
  if (!parsed.success) throw new IncidentFeedClientError("CONTRACT");
  return parsed.data;
}
