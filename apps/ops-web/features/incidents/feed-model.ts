import type { OpsIncident, OpsIncidentFeed } from "@atgt/contracts";

type OpsIncidentFeedItem = OpsIncidentFeed["items"][number];

export type IncidentFeedPhase =
  | "synthetic"
  | "fresh"
  | "stale"
  | "network-error"
  | "auth-blocked"
  | "contract-error";

export interface IncidentFeedState {
  readonly cursor: string;
  readonly events: readonly OpsIncidentFeedItem[];
  readonly incidents: readonly OpsIncident[];
  readonly selectedIncidentId?: string;
  readonly hasMore: boolean;
  readonly phase: IncidentFeedPhase;
  readonly lastValidatedAt?: string;
  readonly notice?: string;
}

export class IncidentFeedInvariantError extends Error {
  readonly code = "CURSOR_REGRESSION";

  constructor() {
    super("Incident feed cursor regressed");
    this.name = "IncidentFeedInvariantError";
  }
}

const PRIORITY_RANK: Readonly<Record<OpsIncident["priority"], number>> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function cursor(value: string): bigint {
  return BigInt(value);
}

function buildIncidentQueue(
  events: readonly OpsIncidentFeedItem[],
): readonly OpsIncident[] {
  const latest = new Map<string, OpsIncidentFeedItem>();
  for (const event of events) {
    if (!latest.has(event.incident.id)) latest.set(event.incident.id, event);
  }
  return Object.freeze(
    [...latest.values()]
      .sort(
        (left, right) =>
          PRIORITY_RANK[left.incident.priority] -
            PRIORITY_RANK[right.incident.priority] ||
          (cursor(right.cursor) > cursor(left.cursor) ? 1 : -1),
      )
      .map((event) => Object.freeze({ ...event.incident })),
  );
}

export function emptyIncidentFeedState(): IncidentFeedState {
  return Object.freeze({
    cursor: "0",
    events: Object.freeze([]),
    incidents: Object.freeze([]),
    hasMore: false,
    phase: "synthetic",
  });
}

export function mergeIncidentFeed(
  state: IncidentFeedState,
  page: OpsIncidentFeed,
  validatedAt: Date,
  source: "synthetic" | "live" = "live",
): IncidentFeedState {
  const currentCursor = cursor(state.cursor);
  const nextCursor = cursor(page.nextCursor);
  if (nextCursor < currentCursor) throw new IncidentFeedInvariantError();

  const byCursor = new Map(state.events.map((event) => [event.cursor, event]));
  for (const event of page.items) {
    if (cursor(event.cursor) > nextCursor) {
      throw new IncidentFeedInvariantError();
    }
    byCursor.set(event.cursor, Object.freeze({ ...event }));
  }
  const events = Object.freeze(
    [...byCursor.values()].sort((left, right) =>
      cursor(left.cursor) > cursor(right.cursor) ? -1 : 1,
    ),
  );
  const incidents = buildIncidentQueue(events);
  const selectedIncidentId = incidents.some(
    (incident) => incident.id === state.selectedIncidentId,
  )
    ? state.selectedIncidentId
    : incidents[0]?.id;

  return Object.freeze({
    cursor: page.nextCursor,
    events,
    incidents,
    selectedIncidentId,
    hasMore: page.hasMore,
    phase: source === "synthetic" ? "synthetic" : "fresh",
    lastValidatedAt: validatedAt.toISOString(),
  });
}

export function selectIncident(
  state: IncidentFeedState,
  incidentId: string,
): IncidentFeedState {
  if (!state.incidents.some((incident) => incident.id === incidentId))
    return state;
  return Object.freeze({ ...state, selectedIncidentId: incidentId });
}

export function markIncidentFeedStale(
  state: IncidentFeedState,
  observedAt: Date,
  staleAfterMs: number,
): IncidentFeedState {
  if (!Number.isInteger(staleAfterMs) || staleAfterMs < 1) {
    throw new Error("staleAfterMs must be an explicit positive integer");
  }
  if (!state.lastValidatedAt || state.phase === "synthetic") return state;
  const isStale =
    observedAt.getTime() - new Date(state.lastValidatedAt).getTime() >=
    staleAfterMs;
  return isStale
    ? Object.freeze({
        ...state,
        phase: "stale" as const,
        notice: "Dữ liệu đã quá thời hạn làm mới; hãy tải lại trước khi xử lý.",
      })
    : state;
}

export function markIncidentFeedFailure(
  state: IncidentFeedState,
  phase: Exclude<IncidentFeedPhase, "synthetic" | "fresh" | "stale">,
): IncidentFeedState {
  const notice =
    phase === "auth-blocked"
      ? "Phiên không có quyền đọc hàng đợi này."
      : phase === "contract-error"
        ? "Phản hồi không đúng hợp đồng; dữ liệu mới không được nhập vào hàng đợi."
        : "Không kết nối được; đang giữ bản dữ liệu đã xác thực gần nhất.";
  return Object.freeze({ ...state, phase, notice });
}
