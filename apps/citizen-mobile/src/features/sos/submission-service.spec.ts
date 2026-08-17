import type { SosAcceptedDto } from "@atgt/contracts";
import { SosTransportError } from "./api-client";
import {
  SOS_QUEUE_VERSION,
  SosQueueItemSchema,
  type SosQueueEnvelope,
  type SosSubmissionInput,
} from "./model";
import type {
  EncryptedSosQueueStore,
  SosAnalyticsEvent,
  SosTransport,
} from "./ports";
import { SosSubmissionService } from "./submission-service";

const IDENTIFIERS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];
const INPUT: SosSubmissionInput = {
  fix: {
    coordinateLongitude: 108.4384,
    coordinateLatitude: 11.9404,
    accuracyMeters: 20,
    capturedAt: "2026-08-17T04:00:00.000Z",
  },
  incidentType: "TRAFFIC_ACCIDENT",
  description: "Va chạm hai xe",
};
const ACK: SosAcceptedDto = {
  publicCode: "01ABCDEFGHJK",
  status: "RECEIVED",
  receivedAt: "2026-08-17T04:00:01.000Z",
  emergencyContacts: [{ name: "Cuu nan - Cuu ho", number: "112", type: "112" }],
};

class MemoryQueueStore implements EncryptedSosQueueStore {
  envelope: SosQueueEnvelope = { version: SOS_QUEUE_VERSION, items: [] };
  async load() {
    return structuredClone(this.envelope);
  }
  async save(envelope: SosQueueEnvelope) {
    this.envelope = structuredClone(envelope);
  }
}

function harness(send: SosTransport["send"] = jest.fn(async () => ACK)) {
  const store = new MemoryQueueStore();
  const ids = [...IDENTIFIERS];
  const events: SosAnalyticsEvent[] = [];
  const transport = {
    send: jest.fn<
      ReturnType<SosTransport["send"]>,
      Parameters<SosTransport["send"]>
    >(send),
  };
  const service = new SosSubmissionService(
    store,
    transport,
    { newUuid: () => ids.shift()! },
    { now: () => new Date("2026-08-17T04:00:00.000Z") },
    { record: (event) => events.push(event) },
  );
  return { store, transport, service, events };
}

describe("SosSubmissionService", () => {
  it("persists offline before any send and does not claim acknowledgement", async () => {
    const { service, store, transport, events } = harness();
    const result = await service.submit(INPUT, false);

    expect(result.item.deliveryState).toBe("SAVED_ON_DEVICE");
    expect(result.item.acknowledgement).toBeUndefined();
    expect(store.envelope.items).toHaveLength(1);
    expect(transport.send).not.toHaveBeenCalled();
    expect(events).toEqual(["SOS_QUEUE_SAVED"]);
  });

  it("creates acknowledgement only after a successful transport response", async () => {
    const { service, transport, events } = harness();
    const result = await service.submit(INPUT, true);

    expect(result.item.deliveryState).toBe("SERVER_ACKNOWLEDGED");
    expect(result.item.acknowledgement).toEqual(ACK);
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      "SOS_QUEUE_SAVED",
      "SOS_SEND_STARTED",
      "SOS_SERVER_ACKNOWLEDGED",
    ]);
  });

  it("single-flights a double action into one queue item and one transport call", async () => {
    let resolve!: (ack: SosAcceptedDto) => void;
    const pending = new Promise<SosAcceptedDto>((done) => {
      resolve = done;
    });
    const { service, transport, store } = harness(async () => pending);

    const first = service.submit(INPUT, true);
    const second = service.submit(INPUT, true);
    expect(first).toBe(second);
    resolve(ACK);
    await Promise.all([first, second]);

    expect(store.envelope.items).toHaveLength(1);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it("recovers an interrupted app restart and retries with the same idempotency key", async () => {
    const original = harness();
    const saved = await original.service.submit(INPUT, false);
    original.store.envelope.items[0] = SosQueueItemSchema.parse({
      ...saved.item,
      deliveryState: "SENDING",
    });
    const key = saved.item.idempotencyKey;
    const transport = { send: jest.fn(async () => ACK) };
    const restarted = new SosSubmissionService(
      original.store,
      transport,
      {
        newUuid: () => {
          throw new Error("no new key expected");
        },
      },
      { now: () => new Date("2026-08-17T04:01:00.000Z") },
    );

    await expect(restarted.recover()).resolves.toMatchObject({
      items: [{ deliveryState: "SAVED_ON_DEVICE", idempotencyKey: key }],
    });
    const drained = await restarted.drain();
    expect(drained.items[0]).toMatchObject({
      deliveryState: "SERVER_ACKNOWLEDGED",
      idempotencyKey: key,
    });
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: key }),
    );
  });

  it("retains failed items and safely retries them after reconnect", async () => {
    let attempt = 0;
    const { service, store } = harness(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new SosTransportError("NETWORK_UNAVAILABLE", true);
      }
      return ACK;
    });

    const failed = await service.submit(INPUT, true);
    expect(failed.item).toMatchObject({
      deliveryState: "SEND_FAILED",
      retryCount: 1,
      lastErrorCode: "NETWORK_UNAVAILABLE",
    });
    expect(failed.item.acknowledgement).toBeUndefined();

    const retried = await service.drain();
    expect(retried.items[0]).toMatchObject({
      deliveryState: "SERVER_ACKNOWLEDGED",
      retryCount: 1,
      acknowledgement: ACK,
    });
    expect(store.envelope).toEqual(retried);
  });

  it("preserves a rejected request without automatically resending it", async () => {
    const { service, transport } = harness(async () => {
      throw new SosTransportError("HTTP_REJECTED", false);
    });

    const failed = await service.submit(INPUT, true);
    expect(failed.item).toMatchObject({
      deliveryState: "SEND_FAILED",
      lastErrorCode: "HTTP_REJECTED",
    });
    await service.drain();
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it("preserves a new SOS queued while an earlier acknowledgement is in flight", async () => {
    let resolve!: (ack: SosAcceptedDto) => void;
    const pending = new Promise<SosAcceptedDto>((done) => {
      resolve = done;
    });
    const { service, store, transport } = harness(async () => pending);
    const first = await service.submit(INPUT, false);

    const draining = service.drain();
    await Promise.resolve();
    const second = await service.submit(
      { ...INPUT, incidentType: "CNCH" },
      false,
    );
    resolve(ACK);
    await draining;

    expect(store.envelope.items).toHaveLength(2);
    expect(store.envelope.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clientEventId: first.item.clientEventId,
          deliveryState: "SERVER_ACKNOWLEDGED",
        }),
        expect.objectContaining({
          clientEventId: second.item.clientEventId,
          deliveryState: "SERVER_ACKNOWLEDGED",
        }),
      ]),
    );
    expect(transport.send).toHaveBeenCalledTimes(2);
  });
});
