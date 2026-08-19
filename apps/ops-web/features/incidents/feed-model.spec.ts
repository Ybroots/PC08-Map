import type { OpsIncidentFeed } from "@atgt/contracts";
import {
  IncidentFeedInvariantError,
  emptyIncidentFeedState,
  markIncidentFeedFailure,
  markIncidentFeedStale,
  mergeIncidentFeed,
  selectIncident,
} from "./feed-model";

type OpsIncidentFeedItem = OpsIncidentFeed["items"][number];

const incident = (id: string, priority: "CRITICAL" | "HIGH" = "HIGH") => ({
  id,
  publicCode: "7KD2M8Q4VT9H",
  incidentType: "TRAFFIC_ACCIDENT",
  priority,
  coordinateLongitude: 108.4384,
  coordinateLatitude: 11.9404,
  accuracyMeters: 8.5,
  occurredAt: "2026-08-19T04:04:00.000Z",
  receivedAt: "2026-08-19T04:04:18.000Z",
  state: "RECEIVED" as const,
  areaId: "area-dalat",
  version: 1,
});

const event = (
  cursor: string,
  id = "00000000-0000-4000-8000-000000000701",
  priority: "CRITICAL" | "HIGH" = "HIGH",
): OpsIncidentFeedItem => ({
  cursor,
  fromState: null,
  toState: "RECEIVED",
  changedAt: "2026-08-19T04:04:18.000Z",
  incident: incident(id, priority),
});

const page = (
  items: OpsIncidentFeedItem[],
  nextCursor: string,
): OpsIncidentFeed => ({ items, nextCursor, hasMore: false });

describe("incident feed resume model", () => {
  it("dedupes overlapping pages and keeps one latest incident projection", () => {
    const first = mergeIncidentFeed(
      emptyIncidentFeedState(),
      page([event("10"), event("11")], "11"),
      new Date("2026-08-19T04:05:00.000Z"),
    );
    const merged = mergeIncidentFeed(
      first,
      page(
        [
          event("11"),
          event("12", "00000000-0000-4000-8000-000000000702", "CRITICAL"),
        ],
        "12",
      ),
      new Date("2026-08-19T04:06:00.000Z"),
    );

    expect(merged.cursor).toBe("12");
    expect(merged.events.map((item) => item.cursor)).toEqual([
      "12",
      "11",
      "10",
    ]);
    expect(merged.incidents).toHaveLength(2);
    expect(merged.incidents[0]?.priority).toBe("CRITICAL");
  });

  it("rejects cursor regression without mutating validated state", () => {
    const state = mergeIncidentFeed(
      emptyIncidentFeedState(),
      page([event("10")], "10"),
      new Date("2026-08-19T04:05:00.000Z"),
    );
    expect(() =>
      mergeIncidentFeed(
        state,
        page([event("9")], "9"),
        new Date("2026-08-19T04:06:00.000Z"),
      ),
    ).toThrow(IncidentFeedInvariantError);
    expect(state.cursor).toBe("10");
    expect(state.events).toHaveLength(1);
  });

  it("keeps selection and exposes stale/failure states without clearing data", () => {
    const secondId = "00000000-0000-4000-8000-000000000702";
    const state = mergeIncidentFeed(
      emptyIncidentFeedState(),
      page([event("10"), event("11", secondId)], "11"),
      new Date("2026-08-19T04:05:00.000Z"),
    );
    const selected = selectIncident(state, secondId);
    const stale = markIncidentFeedStale(
      selected,
      new Date("2026-08-19T04:06:00.000Z"),
      30_000,
    );
    const failed = markIncidentFeedFailure(stale, "network-error");

    expect(selected.selectedIncidentId).toBe(secondId);
    expect(stale.phase).toBe("stale");
    expect(failed.phase).toBe("network-error");
    expect(failed.incidents).toHaveLength(2);
    expect(() => markIncidentFeedStale(state, new Date(), 0)).toThrow(
      "explicit positive integer",
    );
  });
});
