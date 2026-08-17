import type { SosAcceptedDto } from "@atgt/contracts";
import {
  FetchSosTransport,
  SosTransportError,
  type FetchPort,
} from "./api-client";
import { SosQueueItemSchema, type SosQueueItem } from "./model";

const ACKNOWLEDGEMENT: SosAcceptedDto = {
  publicCode: "01ABCDEFGHJK",
  status: "RECEIVED",
  receivedAt: "2026-08-17T04:00:01.000Z",
  emergencyContacts: [{ name: "Cuu nan - Cuu ho", number: "112", type: "112" }],
};

const ITEM: SosQueueItem = SosQueueItemSchema.parse({
  clientEventId: "11111111-1111-4111-8111-111111111111",
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
  createdAt: "2026-08-17T04:00:00.000Z",
  retryCount: 0,
  mediaChecksum: null,
  deliveryState: "SAVED_ON_DEVICE",
  payload: {
    coordinateLongitude: 108.4384,
    coordinateLatitude: 11.9404,
    accuracyMeters: 10,
    incidentType: "TRAFFIC_ACCIDENT",
    clientEventAt: "2026-08-17T04:00:00.000Z",
  },
});

describe("FetchSosTransport", () => {
  it("sends the stable key in the header and accepts only a valid 202 response", async () => {
    const fetcher = jest.fn<ReturnType<FetchPort>, Parameters<FetchPort>>(
      async () => ({
        status: 202,
        json: async () => ACKNOWLEDGEMENT,
      }),
    );
    const transport = new FetchSosTransport(
      "https://api.atgt.example/",
      fetcher,
    );

    await expect(transport.send(ITEM)).resolves.toEqual(ACKNOWLEDGEMENT);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.atgt.example/api/v1/public/sos",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": ITEM.idempotencyKey,
        }),
        body: JSON.stringify(ITEM.payload),
      }),
    );
  });

  it.each([
    [200, ACKNOWLEDGEMENT, "HTTP_REJECTED"],
    [202, { publicCode: "bad" }, "INVALID_ACKNOWLEDGEMENT"],
    [503, {}, "HTTP_RETRYABLE"],
  ])(
    "does not acknowledge status %s with malformed/unexpected data",
    async (status, body, code) => {
      const transport = new FetchSosTransport(
        "https://api.atgt.example",
        jest.fn(async () => ({ status, json: async () => body })),
      );
      await expect(transport.send(ITEM)).rejects.toMatchObject({ code });
    },
  );

  it("classifies network failures without exposing provider detail", async () => {
    const transport = new FetchSosTransport(
      "http://localhost:3000",
      jest.fn(async () => {
        throw new Error("socket detail must not escape");
      }),
    );
    await expect(transport.send(ITEM)).rejects.toEqual(
      new SosTransportError("NETWORK_UNAVAILABLE", true),
    );
  });

  it("fails closed for non-TLS production endpoints", () => {
    expect(
      () => new FetchSosTransport("http://api.atgt.example", jest.fn()),
    ).toThrow("SOS_API_BASE_URL_INVALID");
  });
});
